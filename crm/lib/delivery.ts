/**
 * Draft delivery — routes approved agent drafts to the right channel.
 *
 * Email routing precedence (when the realtor has connected an inbox):
 *   1. Realtor's connected Gmail/Outlook via Composio (sends as the realtor —
 *      their address, their domain, their reply-to). Requires {spaceId, userId}
 *      in options + an active IntegrationConnection row for the toolkit.
 *   2. Resend with shared FROM_EMAIL (platform-branded sender — the fallback
 *      for realtors who haven't connected their own inbox yet).
 *
 * If a connected inbox is found but the Composio call fails, we return the
 * error — we do NOT silently fall back to the shared sender. Sending from
 * the wrong identity is worse than not sending; the realtor should see the
 * failure and reconnect/retry.
 *
 * SMS routing:
 *   1. Telnyx REST (only path for now; per-realtor SMS-as-themselves is
 *      a follow-up that requires per-realtor 10DLC approval).
 *
 * Notes: no external delivery; treated as immediately "sent" (internal log).
 *
 * Returns a DeliveryResult so the caller can decide the final draft status:
 *   sent=true  → mark draft "sent"
 *   sent=false → mark draft "approved" (human reviewed; delivery failed or
 *                unconfigured); the realtor sees the error in the UI.
 */

import { Resend } from 'resend';
import { supabase } from '@/lib/supabase';
import {
  composioConfigured,
  executeToolForEntity,
} from '@/lib/integrations/composio';
import { logger } from '@/lib/logger';

export interface DeliveryResult {
  sent: boolean;
  /** 'gmail' / 'outlook' = via realtor's inbox; 'email' = via shared Resend. */
  method: 'gmail' | 'outlook' | 'email' | 'sms' | 'note';
  error?: string;
}

export interface DraftPayload {
  channel: 'email' | 'sms' | 'note';
  subject: string | null;
  content: string;
}

export interface ContactPayload {
  name: string;
  email: string | null;
  phone: string | null;
}

/**
 * Context for routing the send. Both fields are needed to attempt inbox-
 * connect; absent either, we fall back to Resend.
 */
export interface SendDraftOptions {
  /** Space ID — scopes the IntegrationConnection lookup. */
  spaceId?: string;
  /** Clerk userId of the realtor who approved the draft. Becomes the
   *  Composio entity id for the OAuth lookup. */
  userId?: string;
}

// ─── Inbox-connect: send as the realtor via Composio ──────────────────────────

type InboxToolkit = 'gmail' | 'outlook';

/** Composio action slugs for "send mail" per toolkit. */
const INBOX_SEND_SLUG: Record<InboxToolkit, string> = {
  gmail: 'GMAIL_SEND_EMAIL',
  outlook: 'OUTLOOK_SEND_EMAIL',
};

/**
 * Returns the first active inbox toolkit connected for this (space, user),
 * or null. Gmail wins ties because it's the dominant realtor inbox; if a
 * realtor has both, the deliberate fallback to Outlook would need an
 * explicit per-space preference (not built yet — configuration is failure
 * to decide).
 */
async function activeInboxToolkit(
  spaceId: string,
  userId: string,
): Promise<InboxToolkit | null> {
  const { data, error } = await supabase
    .from('IntegrationConnection')
    .select('toolkit')
    .eq('spaceId', spaceId)
    .eq('userId', userId)
    .eq('status', 'active')
    .in('toolkit', ['gmail', 'outlook']);

  if (error || !data?.length) return null;
  const toolkits = new Set(data.map((r) => r.toolkit));
  if (toolkits.has('gmail')) return 'gmail';
  if (toolkits.has('outlook')) return 'outlook';
  return null;
}

async function deliverViaInbox(
  toolkit: InboxToolkit,
  draft: DraftPayload,
  contact: ContactPayload,
  userId: string,
): Promise<DeliveryResult> {
  if (!contact.email) {
    return { sent: false, method: toolkit, error: 'Contact has no email address' };
  }
  if (!composioConfigured()) {
    return { sent: false, method: toolkit, error: 'composio_not_configured' };
  }

  try {
    const res = await executeToolForEntity({
      entityId: userId,
      slug: INBOX_SEND_SLUG[toolkit],
      arguments: {
        // Both Gmail and Outlook composio actions accept this shape. If the
        // action surface changes (Composio bumps a version), the failure
        // mode is a clean error from the SDK, not a silent misdelivery.
        recipient_email: contact.email,
        to: contact.email,
        subject: draft.subject ?? 'A message for you',
        body: draft.content,
      },
    });

    // The SDK's ToolExecuteResponse has `successful` and `error`. Map to
    // our shape so the caller never needs to know which provider we used.
    const successful = (res as { successful?: boolean }).successful;
    if (successful === false) {
      const err = (res as { error?: string | null }).error ?? 'inbox_send_failed';
      logger.warn('[delivery] inbox send returned not-successful', {
        toolkit,
        error: err,
      });
      return { sent: false, method: toolkit, error: err };
    }
    return { sent: true, method: toolkit };
  } catch (err) {
    logger.error('[delivery] inbox send threw', { toolkit }, err as Error);
    return { sent: false, method: toolkit, error: (err as Error).message };
  }
}

// ─── Email via Resend (shared-sender fallback) ────────────────────────────────

async function deliverEmail(
  draft: DraftPayload,
  contact: ContactPayload,
  fromName: string,
): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    return { sent: false, method: 'email', error: 'not_configured' };
  }
  if (!contact.email) {
    return { sent: false, method: 'email', error: 'Contact has no email address' };
  }

  try {
    const resend = new Resend(apiKey);
    const from = fromEmail.includes('<') ? fromEmail : `${fromName} <${fromEmail}>`;

    const { error } = await resend.emails.send({
      from,
      to: contact.email,
      subject: draft.subject ?? 'A message for you',
      text: draft.content,
    });

    if (error) return { sent: false, method: 'email', error: error.message };
    return { sent: true, method: 'email' };
  } catch (err) {
    return { sent: false, method: 'email', error: String(err) };
  }
}

// ─── SMS via Telnyx REST API ──────────────────────────────────────────────────

async function deliverSms(
  draft: DraftPayload,
  contact: ContactPayload,
): Promise<DeliveryResult> {
  const apiKey = process.env.TELNYX_API_KEY;
  const fromNumber = process.env.TELNYX_FROM_NUMBER;

  if (!apiKey || !fromNumber) {
    return { sent: false, method: 'sms', error: 'not_configured' };
  }
  if (!contact.phone) {
    return { sent: false, method: 'sms', error: 'Contact has no phone number' };
  }

  try {
    const res = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromNumber,
        to: contact.phone,
        text: draft.content,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const errMsg =
        (body as { errors?: { detail?: string }[] }).errors?.[0]?.detail ??
        `Telnyx error ${res.status}`;
      return { sent: false, method: 'sms', error: errMsg };
    }
    return { sent: true, method: 'sms' };
  } catch (err) {
    return { sent: false, method: 'sms', error: String(err) };
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Attempt to deliver an approved draft to the contact.
 *
 * @param draft    The draft to deliver (channel, subject, content)
 * @param contact  The recipient (name, email, phone)
 * @param fromName Display name to use as the email sender (e.g. space name)
 *                 — only used when falling back to the shared Resend path.
 * @param options  Per-realtor context that enables inbox-connect routing.
 *                 Both spaceId and userId required; if either is missing,
 *                 we skip the inbox lookup and use the shared sender.
 */
export async function sendDraft(
  draft: DraftPayload,
  contact: ContactPayload,
  fromName: string,
  options: SendDraftOptions = {},
): Promise<DeliveryResult> {
  switch (draft.channel) {
    case 'email': {
      // Try the realtor's connected inbox first. The point of inbox-connect
      // is "every email looks like it came from the realtor, on their
      // domain, with their reply-to" — that semantic is preserved across
      // their whole book of business once they've connected once.
      if (options.spaceId && options.userId) {
        try {
          const toolkit = await activeInboxToolkit(options.spaceId, options.userId);
          if (toolkit) {
            return deliverViaInbox(toolkit, draft, contact, options.userId);
          }
        } catch (err) {
          // Lookup failure must not block the send — fall back to Resend.
          // We log but don't bail because the realtor still needs to be
          // able to send when the integration-connection table is unhappy.
          logger.warn('[delivery] inbox lookup failed; falling back to shared sender', {
            spaceId: options.spaceId,
          }, err as Error);
        }
      }
      return deliverEmail(draft, contact, fromName);
    }
    case 'sms':
      return deliverSms(draft, contact);
    case 'note':
      // Notes are internal — no external delivery; mark as sent immediately
      return { sent: true, method: 'note' };
  }
}
