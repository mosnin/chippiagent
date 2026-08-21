/**
 * Telnyx SMS integration.
 *
 * Sends SMS messages via the Telnyx API.
 * Requires TELNYX_API_KEY and TELNYX_FROM_NUMBER env vars.
 * Gracefully no-ops when credentials are missing.
 */

import { logger } from '@/lib/logger';

const E164_RE = /^\+\d{10,15}$/;

/** Premium-rate prefixes. Sending here is toll fraud — fail closed. */
const PREMIUM_PREFIXES = ['+1900', '+1976', '+44870', '+44871', '+44872', '+44090', '+44091'];

/**
 * Normalize a stored or typed phone number to E.164.
 *
 * Intake and contact create persist whatever the realtor/lead typed —
 * `(555) 123-4567`, `5551234567`, `+1 555 123 4567`. Telnyx rejects
 * anything that isn't `+` plus 10–15 digits. Returns null when the
 * input cannot be a destination (too short, junk, or not E.164 after
 * US-default `+1`).
 */
export function toE164(input: string): string | null {
  const cleaned = input.replace(/[^\d+]/g, '');
  if (cleaned.length < 10) return null;

  let candidate: string;
  if (cleaned.startsWith('+')) {
    candidate = cleaned;
  } else if (/^\d{10}$/.test(cleaned)) {
    candidate = `+1${cleaned}`;
  } else if (/^1\d{10}$/.test(cleaned)) {
    candidate = `+${cleaned}`;
  } else if (/^\d{10,15}$/.test(cleaned)) {
    candidate = `+${cleaned}`;
  } else {
    return null;
  }

  return E164_RE.test(candidate) ? candidate : null;
}

export function isBlockedSmsDestination(e164: string): boolean {
  return PREMIUM_PREFIXES.some((prefix) => e164.startsWith(prefix));
}

// Log a clear warning at module load time if Telnyx env vars are missing
if (!process.env.TELNYX_API_KEY) {
  logger.warn('[sms] TELNYX_API_KEY is not set — SMS notifications will be skipped');
}
if (!process.env.TELNYX_FROM_NUMBER) {
  logger.warn('[sms] TELNYX_FROM_NUMBER is not set — SMS notifications will be skipped');
} else if (!E164_RE.test(process.env.TELNYX_FROM_NUMBER)) {
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

  if (isBlockedSmsDestination(toNumber)) {
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
    logger.info('[sms] sent', {
      to: toNumber,
      messageId: response?.data?.id ?? 'unknown',
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
