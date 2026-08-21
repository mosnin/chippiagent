/**
 * Telnyx SMS integration.
 *
 * Sends SMS messages via the Telnyx API.
 * Requires TELNYX_API_KEY and TELNYX_FROM_NUMBER env vars.
 * Gracefully no-ops when credentials are missing.
 */

import { logger } from '@/lib/logger';

// Log a clear warning at module load time if Telnyx env vars are missing
if (!process.env.TELNYX_API_KEY) {
  logger.warn('[sms] TELNYX_API_KEY is not set — SMS notifications will be skipped');
}
if (!process.env.TELNYX_FROM_NUMBER) {
  logger.warn('[sms] TELNYX_FROM_NUMBER is not set — SMS notifications will be skipped');
} else if (!/^\+\d{10,15}$/.test(process.env.TELNYX_FROM_NUMBER)) {
  logger.warn('[sms] TELNYX_FROM_NUMBER is not a valid E.164 phone number');
}

let telnyxClient: any = null;

async function getClient() {
  if (!process.env.TELNYX_API_KEY) {
    logger.warn('[sms] Cannot create Telnyx client — TELNYX_API_KEY missing');
    return null;
  }
  if (!telnyxClient) {
    try {
      const telnyx = await import('telnyx');
      // The SDK exports both a default and named `Telnyx` constructor
      const TelnyxConstructor = telnyx.Telnyx ?? telnyx.default;
      telnyxClient = new TelnyxConstructor({ apiKey: process.env.TELNYX_API_KEY });
    } catch (err) {
      logger.error('[sms] Failed to initialize Telnyx SDK', undefined, err);
      return null;
    }
  }
  return telnyxClient;
}

export interface SendSMSParams {
  to: string;
  body: string;
  /** Optional public URLs for media attachments — when present Telnyx
   *  upgrades the message to MMS. Carrier-side limits apply (typically
   *  ~600 KB per asset, ~1 MB total). */
  mediaUrls?: string[];
}

const E164_RE = /^\+\d{10,15}$/;
const PREMIUM_PREFIXES = ['+1900', '+1976', '+44870', '+44871', '+44872', '+44090', '+44091'];

/**
 * Canonicalize a stored or typed phone number to E.164.
 *
 * US numbers are often saved as `5551234567` or `15551234567` (no plus).
 * Blindly prefixing `+1` turns the 11-digit form into `+115551234567` and
 * the message goes to the wrong destination. International numbers without
 * a leading `+` are refused — guessing a country code is worse than failing.
 * Returns null when the input cannot be a valid destination.
 */
export function toE164(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  const hasPlus = text.startsWith('+');
  const digits = text.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;

  let e164: string;
  if (hasPlus) {
    e164 = `+${digits}`;
  } else if (digits.length === 10) {
    e164 = `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    e164 = `+${digits}`;
  } else {
    return null;
  }

  return E164_RE.test(e164) ? e164 : null;
}

/** True only when Telnyx returned a message id — HTTP success without an id is not a send. */
export function telnyxAcceptedSend(response: unknown): boolean {
  if (!response || typeof response !== 'object') return false;
  const rec = response as Record<string, unknown>;
  const data = rec.data;
  const fromData =
    data && typeof data === 'object' ? (data as Record<string, unknown>).id : undefined;
  const id = fromData ?? rec.id;
  return typeof id === 'string' && id.length > 0;
}

/**
 * Send an SMS via Telnyx. Returns true if sent, false if skipped/failed.
 * Never throws — errors are logged and swallowed.
 */
export async function sendSMS(params: SendSMSParams): Promise<boolean> {
  const client = await getClient();
  const fromNumber = process.env.TELNYX_FROM_NUMBER;

  if (!client || !fromNumber) {
    logger.warn('[sms] skipped — Telnyx credentials missing', {
      apiKeySet: Boolean(process.env.TELNYX_API_KEY),
      fromNumberSet: Boolean(fromNumber),
      to: params.to,
    });
    return false;
  }

  const toNumber = toE164(params.to);
  if (!toNumber) {
    logger.warn('[sms] phone number not valid E.164', { to: params.to });
    return false;
  }

  if (PREMIUM_PREFIXES.some((prefix) => toNumber.startsWith(prefix))) {
    logger.warn('[sms] blocked premium-rate number', { to: toNumber });
    return false;
  }

  try {
    const hasMedia = Array.isArray(params.mediaUrls) && params.mediaUrls.length > 0;
    const response = await client.messages.send({
      from: fromNumber,
      to: toNumber,
      text: params.body,
      // Including media_urls promotes the send from SMS to MMS server-side.
      // Telnyx expects an array of publicly fetchable URLs — caller is
      // responsible for making sure the URLs resolve without auth.
      ...(hasMedia ? { media_urls: params.mediaUrls } : {}),
    });
    if (!telnyxAcceptedSend(response)) {
      logger.error('[sms] provider returned no message id — not marking sent', {
        to: toNumber,
      });
      return false;
    }
    const messageId =
      (response as { data?: { id?: string }; id?: string })?.data?.id ??
      (response as { id?: string }).id;
    logger.info('[sms] sent', {
      to: toNumber,
      messageId,
      bodyLength: params.body.length,
      mediaCount: hasMedia ? params.mediaUrls!.length : 0,
    });
    return true;
  } catch (err: any) {
    logger.error('[sms] send failed', {
      to: toNumber,
      status: err?.statusCode ?? err?.status,
      code: err?.code,
    }, err);
    return false;
  }
}

// ── Pre-built SMS templates ──────────────────────────────────────────────

export function newLeadSMS(p: { spaceName: string; leadName: string; leadPhone?: string | null; phone: string; scoreLabel?: string | null }): SendSMSParams {
  const score = p.scoreLabel ? ` (${p.scoreLabel})` : '';
  const leadContact = p.leadPhone ? ` Phone: ${p.leadPhone}.` : '';
  return {
    to: p.phone,
    body: `[${p.spaceName}] New lead: ${p.leadName}${score}.${leadContact} Open your dashboard to review.`,
  };
}

export function newTourSMS(p: { spaceName: string; guestName: string; date: string; time: string; property?: string | null; phone: string }): SendSMSParams {
  const prop = p.property ? ` at ${p.property}` : '';
  return {
    to: p.phone,
    body: `[${p.spaceName}] New tour booked: ${p.guestName}${prop} on ${p.date} at ${p.time}. Check your dashboard for details.`,
  };
}

export function tourConfirmationSMS(p: { guestName: string; guestPhone: string; businessName: string; date: string; time: string; property?: string | null }): SendSMSParams {
  const prop = p.property ? ` at ${p.property}` : '';
  return {
    to: p.guestPhone,
    body: `Hi ${p.guestName}! Your tour with ${p.businessName}${prop} is confirmed for ${p.date} at ${p.time}. Contact your agent if you need to reschedule.`,
  };
}

export function tourReminderSMS(p: { guestName: string; guestPhone: string; businessName: string; time: string; property?: string | null }): SendSMSParams {
  const prop = p.property ? ` at ${p.property}` : '';
  return {
    to: p.guestPhone,
    body: `Hi ${p.guestName}, reminder: your tour with ${p.businessName}${prop} is tomorrow at ${p.time}. See you there!`,
  };
}

export function newDealSMS(p: { spaceName: string; dealTitle: string; value?: string | null; phone: string }): SendSMSParams {
  const val = p.value ? ` (${p.value})` : '';
  return {
    to: p.phone,
    body: `[${p.spaceName}] New deal created: ${p.dealTitle}${val}. Open your dashboard to manage it.`,
  };
}

export function followUpReminderSMS(p: { spaceName: string; contactName: string; phone: string }): SendSMSParams {
  return {
    to: p.phone,
    body: `[${p.spaceName}] Reminder: Follow up with ${p.contactName} today. Open your dashboard to review.`,
  };
}
