/**
 * `send_email` — the first mutating tool. Composes + sends an email to a
 * contact via the existing lib/email `sendEmailFromCRM` helper.
 *
 * Approval-gated: the loop will emit `permission_required` for every call,
 * and `continueTurn` runs the handler only after the user approves.
 *
 * Design decisions:
 * - Addresses must resolve to a Contact in the caller's space. The tool
 *   looks up either by contactId (preferred — deterministic) or by email
 *   address (falls back to "known contact" if one exists, else treats the
 *   address as an off-platform recipient and lets the user confirm).
 * - Either `contactId` or `toEmail` is required; the tool refuses with a
 *   helpful error if both are missing.
 * - Body is plain text (rendered as paragraphs in the Resend template).
 *   HTML is explicitly out of scope — the model is not a safe HTML
 *   author for a first mutating tool.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { sendEmailFromCRM, type SendEmailAttachment } from '@/lib/email';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';
import { makeIdempotencyKey, withIdempotency } from '@/lib/agent/ts-idempotency';
import { getSignedDownloadUrl } from '@/lib/storage';

/** Max combined size of all attachments per email. Resend accepts up to
 *  40 MB across all attachments; we cap below that for headroom. */
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const parameters = z
  .object({
    contactId: z
      .string()
      .min(1)
      .optional()
      .describe('Contact.id to send to. Prefer this over toEmail when the contact is in the workspace.'),
    toEmail: z
      .string()
      .email()
      .optional()
      .describe('Recipient email. Use when the recipient isn\'t a saved contact.'),
    subject: z
      .string()
      .min(1)
      .max(200)
      .describe('Subject line. Required.'),
    body: z
      .string()
      .min(1)
      .max(5000)
      .describe('Plain-text body. Paragraphs separated by blank lines. No HTML — the tool wraps it in a safe template.'),
    replyTo: z
      .string()
      .email()
      .optional()
      .describe('Optional reply-to address, falling back to the workspace default.'),
    attachmentFileIds: z
      .array(z.string().min(1))
      .max(10)
      .optional()
      .describe(
        'Optional File.id list to attach to the email. Resolve filenames via list_files first; reads each from storage at send time. Max 10 files / 25 MB combined.',
      ),
  })
  .refine((v) => v.contactId || v.toEmail, {
    message: 'Either contactId or toEmail is required.',
  })
  .describe(
    'Send an email to a contact (or a free-form address). Always prompts the user for approval before sending. Pass attachmentFileIds to include uploaded files.',
  );

interface SendEmailResult {
  deliveredTo: string;
  contactId: string | null;
  subject: string;
}

export const sendEmailTool = defineTool<typeof parameters, SendEmailResult>({
  name: 'send_email',
  riskLevel: 'high',
  description:
    'Send an email to a person. Always prompts the user before sending. Use for follow-ups, tour confirmations, and check-ins.',
  parameters,
  requiresApproval: true,
  // 50 sends/hour/user caps accidental mass-blasts without throttling
  // realistic follow-up sessions.
  rateLimit: { max: 50, windowSeconds: 3600 },
  summariseCall(args) {
    const to = args.toEmail ?? (args.contactId ? `contact ${args.contactId.slice(0, 8)}` : 'a contact');
    return `Email ${to} — "${args.subject}"`;
  },

  async handler(args, ctx) {
    // Resolve the recipient. Three cases, in order of preference:
    //   1. contactId provided → look it up, use that contact's email.
    //   2. toEmail provided, matches a contact in this space → use that.
    //   3. toEmail provided, no matching contact → send to the bare address.
    let resolvedEmail: string | null = null;
    let resolvedContactId: string | null = null;

    if (args.contactId) {
      const { data: contact, error } = await supabase
        .from('Contact')
        .select('id, email, name')
        .eq('id', args.contactId)
        .eq('spaceId', ctx.space.id)
        .is('brokerageId', null)
        .maybeSingle();
      if (error) {
        return { summary: `Contact lookup failed: ${error.message}`, display: 'error' };
      }
      if (!contact) {
        return {
          summary: `No contact with id "${args.contactId}" in this workspace.`,
          display: 'error',
        };
      }
      if (!contact.email) {
        return {
          summary: `${contact.name} has no email on file — add one before sending.`,
          display: 'error',
        };
      }
      resolvedContactId = contact.id;
      resolvedEmail = contact.email;
    } else if (args.toEmail) {
      resolvedEmail = args.toEmail;
      // Best-effort contact lookup so the tool result carries the link.
      const { data: maybeContact } = await supabase
        .from('Contact')
        .select('id')
        .eq('spaceId', ctx.space.id)
        .is('brokerageId', null)
        .eq('email', args.toEmail)
        .maybeSingle();
      resolvedContactId = maybeContact?.id ?? null;
    }

    if (!resolvedEmail) {
      return {
        summary: 'Could not resolve a recipient email address.',
        display: 'error',
      };
    }

    // Workspace's display name for the envelope. The fallback chain is
    // strict about what exists: SpaceSetting.businessName (canonical, set
    // on onboarding) → the Space's display name. We intentionally do NOT
    // include User.name here because that's the owner's personal name,
    // which they may not want on every outbound email.
    const { data: settings } = await supabase
      .from('SpaceSetting')
      .select('businessName')
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    const fromName =
      (settings?.businessName as string | undefined) || ctx.space.name;

    // Resolve attachments BEFORE the send — fetch each File row in this
    // space, download the bytes via a signed URL, and build the Resend
    // payload. We do this serially because attachment counts are small
    // (≤10) and a parallel fetch storm against Wasabi for a single send
    // isn't worth the complexity.
    let resolvedAttachments: SendEmailAttachment[] | undefined;
    if (args.attachmentFileIds && args.attachmentFileIds.length > 0) {
      const ids = args.attachmentFileIds;
      const { data: rows, error: fileErr } = await supabase
        .from('File')
        .select('id, name, mimeType, sizeBytes, storageKey')
        .in('id', ids)
        .eq('spaceId', ctx.space.id);
      if (fileErr) {
        return { summary: `Attachment lookup failed: ${fileErr.message}`, display: 'error' };
      }
      const found = (rows ?? []) as Array<{
        id: string;
        name: string;
        mimeType: string;
        sizeBytes: number;
        storageKey: string;
      }>;
      const missing = ids.filter((id) => !found.find((r) => r.id === id));
      if (missing.length > 0) {
        return {
          summary: `Attachment ids not found: ${missing.join(', ')}`,
          display: 'error',
        };
      }
      const totalBytes = found.reduce((sum, r) => sum + Number(r.sizeBytes ?? 0), 0);
      if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
        return {
          summary: `Attachments exceed ${Math.floor(MAX_TOTAL_ATTACHMENT_BYTES / 1024 / 1024)} MB combined limit.`,
          display: 'error',
        };
      }
      try {
        resolvedAttachments = await Promise.all(
          found.map(async (r) => {
            const url = await getSignedDownloadUrl(r.storageKey, 60);
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Failed to fetch ${r.name} (${res.status})`);
            const buffer = Buffer.from(await res.arrayBuffer());
            return { filename: r.name, content: buffer, contentType: r.mimeType };
          }),
        );
      } catch (err) {
        return {
          summary: `Failed to download attachment: ${err instanceof Error ? err.message : 'unknown error'}`,
          display: 'error',
        };
      }
    }

    const idemKey = makeIdempotencyKey('send_email', ctx.space.id, resolvedEmail, args.subject);
    try {
      await withIdempotency(idemKey, () =>
        sendEmailFromCRM({
          toEmail: resolvedEmail!,
          fromName,
          subject: args.subject,
          body: args.body,
          replyTo: args.replyTo,
          attachments: resolvedAttachments,
        }),
      );
    } catch (err) {
      logger.error(
        '[tools.send_email] delivery failed',
        { spaceId: ctx.space.id, to: resolvedEmail },
        err,
      );
      return {
        summary: `Send failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        display: 'error',
      };
    }

    // Best-effort log of the send as a ContactActivity for the audit trail.
    // Non-fatal — the email went out regardless. PostgREST returns
    // { data, error } rather than throwing on DB errors, so we check the
    // error field explicitly; the surrounding try/catch covers any
    // transport-level exception.
    if (resolvedContactId) {
      try {
        const { error: auditErr } = await supabase.from('ContactActivity').insert({
          id: crypto.randomUUID(),
          spaceId: ctx.space.id,
          contactId: resolvedContactId,
          type: 'email',
          content: `AI-assisted: ${args.subject}`,
          metadata: { via: 'on_demand_agent' },
        });
        if (auditErr) {
          logger.warn(
            '[tools.send_email] audit insert failed',
            { contactId: resolvedContactId },
            auditErr,
          );
        }
      } catch (err) {
        logger.warn('[tools.send_email] audit insert threw', { contactId: resolvedContactId }, err);
      }
    }

    return {
      summary: `Email sent to ${resolvedEmail} — "${args.subject}".`,
      data: {
        deliveredTo: resolvedEmail,
        contactId: resolvedContactId,
        subject: args.subject,
      },
      display: 'success',
    };
  },
});
