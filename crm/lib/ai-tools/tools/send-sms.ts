/**
 * `send_sms` — send an SMS to a contact via Telnyx.
 *
 * Approval-gated. SMS is more intrusive than email (it dings the lead's
 * phone), so the user ALWAYS sees the body + recipient before we send.
 *
 * Recipient resolution mirrors send_email:
 *   1. contactId provided → use that contact's `phone`.
 *   2. toPhone provided   → send to the bare number (optionally matched
 *      back to a Contact for the audit trail).
 *
 * The underlying sendSMS helper validates E.164 + blocks premium-rate
 * numbers + swallows its own errors — it returns `false` on failure
 * rather than throwing, so we check the return value and surface a
 * specific "send failed" summary for the model.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { sendSMS } from '@/lib/sms';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';
import { makeIdempotencyKey, withIdempotency } from '@/lib/agent/ts-idempotency';
import { getPublicUrl } from '@/lib/storage';

/** Telnyx MMS hard limits: keep media count ≤ 5 and total ≤ 1 MB to
 *  avoid carrier-side rejection. Per-asset rules vary by destination
 *  carrier so we keep individual files small too. */
const MMS_MAX_MEDIA_COUNT = 5;
const MMS_MAX_TOTAL_BYTES = 1 * 1024 * 1024;

const parameters = z
  .object({
    contactId: z
      .string()
      .min(1)
      .optional()
      .describe("Contact.id to send to. Prefer this over toPhone when the contact is in the workspace."),
    toPhone: z
      .string()
      .min(7)
      .max(32)
      .optional()
      .describe('Raw phone number when the recipient isn\'t a saved contact. Include country code.'),
    body: z
      .string()
      .min(1)
      .max(1000)
      .describe('SMS body. Keep it short — most carriers cap at 160 chars per segment.'),
    mediaFileIds: z
      .array(z.string().min(1))
      .max(MMS_MAX_MEDIA_COUNT)
      .optional()
      .describe(
        'Optional File.id list (images mostly) to attach as MMS. Files must be public (uploaded under a public prefix). Max 5 files / 1 MB combined per carrier rules.',
      ),
  })
  .refine((v) => v.contactId || v.toPhone, {
    message: 'Either contactId or toPhone is required.',
  })
  .describe('Send an SMS / MMS to a contact or raw phone number. Prompts for approval first.');

interface SendSMSResult {
  deliveredTo: string;
  contactId: string | null;
  bodyLength: number;
}

export const sendSmsTool = defineTool<typeof parameters, SendSMSResult>({
  name: 'send_sms',
  riskLevel: 'high',
  description:
    'Send an SMS to a person (or free-form phone number). Always prompts for approval. Use for tour confirmations, quick check-ins.',
  parameters,
  requiresApproval: true,
  // SMS is billed per-segment; 30/hour keeps bills sane without blocking
  // realistic follow-up workflows.
  rateLimit: { max: 30, windowSeconds: 3600 },
  summariseCall(args) {
    const to = args.toPhone ?? (args.contactId ? `contact ${args.contactId.slice(0, 8)}` : 'a contact');
    const preview = args.body.length > 40 ? `${args.body.slice(0, 40)}…` : args.body;
    return `SMS ${to} — "${preview}"`;
  },

  async handler(args, ctx) {
    let resolvedPhone: string | null = null;
    let resolvedContactId: string | null = null;

    if (args.contactId) {
      const { data: contact, error } = await supabase
        .from('Contact')
        .select('id, name, phone')
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
      if (!contact.phone) {
        return {
          summary: `${contact.name} has no phone number on file — add one before sending.`,
          display: 'error',
        };
      }
      resolvedContactId = contact.id;
      resolvedPhone = contact.phone;
    } else if (args.toPhone) {
      resolvedPhone = args.toPhone;
      // Best-effort link back to a matching Contact for the audit trail.
      const { data: maybeContact } = await supabase
        .from('Contact')
        .select('id')
        .eq('spaceId', ctx.space.id)
        .is('brokerageId', null)
        .eq('phone', args.toPhone)
        .maybeSingle();
      resolvedContactId = maybeContact?.id ?? null;
    }

    if (!resolvedPhone) {
      return { summary: 'Could not resolve a recipient phone number.', display: 'error' };
    }

    // Resolve MMS media: each File must be public (we serve via signed
    // URLs by default, but Telnyx fetches the URL itself from carrier
    // infra and won't carry our auth headers). Files in the public
    // prefixes (chat-attachments/, onboarding/, property-photos/) qualify.
    let mediaUrls: string[] | undefined;
    if (args.mediaFileIds && args.mediaFileIds.length > 0) {
      const { data: rows, error: fileErr } = await supabase
        .from('File')
        .select('id, name, storageKey, sizeBytes, isPublic')
        .in('id', args.mediaFileIds)
        .eq('spaceId', ctx.space.id);
      if (fileErr) {
        return { summary: `Media lookup failed: ${fileErr.message}`, display: 'error' };
      }
      const found = (rows ?? []) as Array<{
        id: string;
        name: string;
        storageKey: string;
        sizeBytes: number;
        isPublic: boolean;
      }>;
      const missing = args.mediaFileIds.filter((id) => !found.find((r) => r.id === id));
      if (missing.length > 0) {
        return { summary: `Media file ids not found: ${missing.join(', ')}`, display: 'error' };
      }
      const notPublic = found.filter((r) => !r.isPublic);
      if (notPublic.length > 0) {
        return {
          summary: `Cannot attach private files to MMS — carrier needs a public URL. Re-upload as public: ${notPublic.map((r) => r.name).join(', ')}.`,
          display: 'error',
        };
      }
      const totalBytes = found.reduce((sum, r) => sum + Number(r.sizeBytes ?? 0), 0);
      if (totalBytes > MMS_MAX_TOTAL_BYTES) {
        return {
          summary: `MMS attachments exceed ${Math.floor(MMS_MAX_TOTAL_BYTES / 1024)} KB combined limit.`,
          display: 'error',
        };
      }
      mediaUrls = found.map((r) => getPublicUrl(r.storageKey));
    }

    // sendSMS returns false on any failure (credentials missing, invalid
    // number, premium prefix, provider error). Distinguish between "we
    // didn't send" vs "provider accepted but silently dropped" isn't
    // possible here — treat false as a delivery failure.
    const idemKey = makeIdempotencyKey('send_sms', ctx.space.id, resolvedPhone, args.body);
    const ok = await withIdempotency(idemKey, () =>
      sendSMS({ to: resolvedPhone!, body: args.body, mediaUrls }),
    );
    if (!ok) {
      return {
        summary: `SMS send failed for ${resolvedPhone}. Check the number, Telnyx credentials, or provider logs.`,
        display: 'error',
      };
    }

    // Audit the send on the Contact's activity feed when linked. The
    // ContactActivity.type enum doesn't include an 'sms' value, so we log
    // under 'note' with a metadata flag the UI can special-case later.
    if (resolvedContactId) {
      const { error: activityErr } = await supabase.from('ContactActivity').insert({
        id: crypto.randomUUID(),
        spaceId: ctx.space.id,
        contactId: resolvedContactId,
        type: 'note',
        content: `SMS: ${args.body.slice(0, 140)}${args.body.length > 140 ? '…' : ''}`,
        metadata: { channel: 'sms', via: 'on_demand_agent' },
      });
      if (activityErr) {
        logger.warn(
          '[tools.send_sms] activity insert failed',
          { contactId: resolvedContactId },
          activityErr,
        );
      }
    }

    return {
      summary: `SMS sent to ${resolvedPhone}.`,
      data: {
        deliveredTo: resolvedPhone,
        contactId: resolvedContactId,
        bodyLength: args.body.length,
      },
      display: 'success',
    };
  },
});
