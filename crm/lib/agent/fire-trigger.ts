/**
 * fireAgentTrigger — server-side helper for queueing an agent trigger.
 *
 * Extracted from app/api/agent/trigger so any server-side mutation route
 * (contacts.POST creating a lead, deal stage change, tour completion, etc.)
 * can fire a trigger without going through the public REST endpoint and its
 * Clerk auth. The route now does auth + delegates here.
 *
 * Behaviour:
 *   1. Rate-limit per space-per-minute (capped at RATE_LIMIT). Rate-limit
 *      only gates the queue — the SMS still goes out.
 *   2. Dedupe within DEDUPE_WINDOW_S via SET NX EX. The key includes
 *      tourId / channel / sourceDraftId / a content fingerprint so two
 *      unique events for the same contact are not collapsed. A duplicate
 *      claim skips SMS and the queue (one text, one wake).
 *   3. For inbound-lead events (`new_lead`, `application_submitted`) with a
 *      contactId, send the first-touch SMS. Same for `inbound_message`
 *      booking replies and `tour_completed` follow-ups. Redis-down still
 *      sends — the product cannot wait on the queue or an approval inbox.
 *   4. RPUSH the trigger to `agent:triggers:{spaceId}` (FIFO queue).
 *      If the push fails, DEL the dedupe claim so a retry is not dropped.
 *   5. If event is in AGENT_IMMEDIATE_EVENTS and MODAL_WEBHOOK_URL is set,
 *      fire the Modal webhook immediately (fire-and-forget).
 *   6. Record the outcome to `agent:trigger:events:{spaceId}` for audit.
 *
 * Never throws — returns `{queued:false, reason}` instead. Callers in
 * mutation routes should not let a trigger-queue failure fail the parent
 * write; the parent operation is what the user asked for.
 */

import {
  isInboundLeadEvent,
  isInboundMessageEvent,
  isTourCompletedEvent,
  isTriggerEvent,
  parseImmediateEvents,
  type TriggerEvent,
} from '@/lib/agent/trigger-policy';
import { draftFirstTouchForLead, type FirstTouchDraftResult } from '@/lib/agent/first-touch';
import {
  draftFirstTouchReplyForLead,
  type FirstTouchReplyDraftResult,
} from '@/lib/agent/first-touch-reply';
import {
  draftTourFollowUpForContact,
  type TourFollowUpDraftResult,
} from '@/lib/agent/tour-follow-up';
import { createHash } from 'node:crypto';

const RATE_LIMIT = 20;
const RATE_WINDOW_S = 60;
const DEDUPE_WINDOW_S = Number(process.env.AGENT_TRIGGER_DEDUPE_WINDOW_S ?? '120');

export interface FireTriggerInput {
  spaceId: string;
  event: TriggerEvent;
  contactId?: string;
  dealId?: string;
  content?: string;
  channel?: 'sms' | 'email';
  sourceDraftId?: string;
  tourId?: string;
}

export interface FireTriggerResult {
  queued: boolean;
  deduped?: boolean;
  firedImmediately?: boolean;
  reason?: string;
  firstTouch?: FirstTouchDraftResult;
  firstTouchReply?: FirstTouchReplyDraftResult;
  tourFollowUp?: TourFollowUpDraftResult;
}

async function recordOutcome(
  kvUrl: string,
  kvToken: string,
  input: FireTriggerInput,
  status: 'deduped' | 'queued' | 'queued_modal',
): Promise<void> {
  const key = `agent:trigger:events:${input.spaceId}`;
  const payload = JSON.stringify({
    event: input.event,
    contactId: input.contactId ?? null,
    dealId: input.dealId ?? null,
    status,
    at: new Date().toISOString(),
  });
  try {
    await fetch(`${kvUrl}/lpush/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([payload]),
    });
    await fetch(`${kvUrl}/ltrim/${encodeURIComponent(key)}/0/199`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}` },
    });
  } catch {
    // Best-effort observability only.
  }
}

async function checkRateLimit(kvUrl: string, kvToken: string, spaceId: string): Promise<boolean> {
  const key = `agent:trigger-rate:${spaceId}:${Math.floor(Date.now() / 60_000)}`;
  const res = await fetch(`${kvUrl}/incr/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}` },
  });
  if (!res.ok) return true; // fail open
  const { result: count } = (await res.json()) as { result: number };
  if (count === 1) {
    await fetch(`${kvUrl}/expire/${encodeURIComponent(key)}/${RATE_WINDOW_S * 2}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}` },
    });
  }
  return count <= RATE_LIMIT;
}

function fingerprint(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return 'none';
  return createHash('sha256').update(trimmed).digest('hex').slice(0, 16);
}

export function makeTriggerDedupeKey(input: FireTriggerInput): string {
  // space+event+contact+deal is too coarse: two tour_completed rows for
  // the same contact, or two inbound_message texts, shared one key and
  // the second unique event was dropped for DEDUPE_WINDOW_S. Content is
  // hashed so Redis keys never hold the SMS body.
  return [
    'agent:trigger-dedupe',
    input.spaceId,
    input.event,
    input.contactId ?? 'none',
    input.dealId ?? 'none',
    input.tourId ?? 'none',
    input.channel ?? 'none',
    input.sourceDraftId ?? 'none',
    fingerprint(input.content),
  ].join(':');
}

async function claimTrigger(
  kvUrl: string,
  kvToken: string,
  input: FireTriggerInput,
): Promise<{ duplicate: boolean; key: string }> {
  const key = makeTriggerDedupeKey(input);
  // SET NX EX in one atomic op. The key lives DEDUPE_WINDOW_S from THIS
  // event, so it is a true sliding window. The old floor(now/window) bucket
  // reset at fixed clock boundaries — two identical events that straddled a
  // boundary both got through — and its INCR+EXPIRE was also non-atomic.
  const res = await fetch(
    `${kvUrl}/set/${encodeURIComponent(key)}/1/EX/${Math.max(1, DEDUPE_WINDOW_S)}/NX`,
    { method: 'POST', headers: { Authorization: `Bearer ${kvToken}` } },
  );
  if (!res.ok) return { duplicate: false, key }; // fail open — never drop a real trigger
  const { result } = (await res.json()) as { result: string | null };
  // 'OK' → key was absent → first occurrence. null → key existed → duplicate.
  return { duplicate: result === null, key };
}

async function releaseTriggerClaim(
  kvUrl: string,
  kvToken: string,
  key: string,
): Promise<void> {
  try {
    await fetch(`${kvUrl}/del/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}` },
    });
  } catch {
    // Best-effort. A stuck 120s claim is better than throwing out of fireAgentTrigger.
  }
}

async function maybeDraftFirstTouch(input: FireTriggerInput): Promise<FirstTouchDraftResult | undefined> {
  if (!isInboundLeadEvent(input.event) || !input.contactId) return undefined;
  try {
    return await draftFirstTouchForLead({
      spaceId: input.spaceId,
      contactId: input.contactId,
    });
  } catch {
    // The wake still matters. The autonomous run is the backstop.
    return undefined;
  }
}

async function maybeDraftFirstTouchReply(
  input: FireTriggerInput,
): Promise<FirstTouchReplyDraftResult | undefined> {
  if (!isInboundMessageEvent(input.event) || !input.contactId) return undefined;
  try {
    return await draftFirstTouchReplyForLead({
      spaceId: input.spaceId,
      contactId: input.contactId,
      replyText: input.content,
      sourceDraftId: input.sourceDraftId,
      channel: input.channel,
    });
  } catch {
    // The wake still matters. The autonomous run is the backstop.
    return undefined;
  }
}

async function maybeDraftTourFollowUp(
  input: FireTriggerInput,
): Promise<TourFollowUpDraftResult | undefined> {
  if (!isTourCompletedEvent(input.event) || !input.contactId) return undefined;
  try {
    return await draftTourFollowUpForContact({
      spaceId: input.spaceId,
      contactId: input.contactId,
      tourId: input.tourId,
    });
  } catch {
    // The wake still matters. The autonomous run is the backstop.
    return undefined;
  }
}

export async function fireAgentTrigger(input: FireTriggerInput): Promise<FireTriggerResult> {
  if (!input.event || !isTriggerEvent(input.event)) {
    return { queued: false, reason: 'invalid_event' };
  }
  if (!input.spaceId) {
    return { queued: false, reason: 'missing_space_id' };
  }

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  let claimKey: string | undefined;
  let rateLimited = false;

  if (kvUrl && kvToken) {
    const allowed = await checkRateLimit(kvUrl, kvToken, input.spaceId);
    if (!allowed) {
      rateLimited = true;
    } else {
      const claim = await claimTrigger(kvUrl, kvToken, input);
      claimKey = claim.key;
      if (claim.duplicate) {
        // Known retry of the same event. Do not send a second SMS and do
        // not enqueue a second wake.
        await recordOutcome(kvUrl, kvToken, input, 'deduped');
        return { queued: true, deduped: true };
      }
    }
  }

  // First-touch / reply / tour-follow-up are the product. Send when this
  // event is not a known Redis duplicate so the SMS still goes out when
  // the queue is down or the space is rate-limited.
  const firstTouch = await maybeDraftFirstTouch(input);
  const firstTouchReply = await maybeDraftFirstTouchReply(input);
  const tourFollowUp = await maybeDraftTourFollowUp(input);

  if (!kvUrl || !kvToken) {
    return { queued: false, reason: 'redis_not_configured', firstTouch, firstTouchReply, tourFollowUp };
  }
  if (rateLimited) {
    return { queued: false, reason: 'rate_limited', firstTouch, firstTouchReply, tourFollowUp };
  }

  const trigger = JSON.stringify({
    event: input.event,
    contactId: input.contactId ?? null,
    dealId: input.dealId ?? null,
    spaceId: input.spaceId,
    content: input.content ?? null,
    channel: input.channel ?? null,
    sourceDraftId: input.sourceDraftId ?? null,
    tourId: input.tourId ?? null,
    queuedAt: new Date().toISOString(),
  });
  const key = `agent:triggers:${input.spaceId}`;

  const pushRes = await fetch(`${kvUrl}/rpush/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([trigger]),
  });
  if (!pushRes.ok) {
    // SET NX already claimed this unique event. If we keep the key after a
    // failed RPUSH, retries inside the window are treated as duplicates
    // and the event is dropped — no queue, no wake.
    if (claimKey) {
      await releaseTriggerClaim(kvUrl, kvToken, claimKey);
    }
    return { queued: false, reason: 'redis_push_failed', firstTouch, firstTouchReply, tourFollowUp };
  }

  const MODAL_WEBHOOK_URL = process.env.MODAL_WEBHOOK_URL ?? '';
  const AGENT_INTERNAL_SECRET = process.env.AGENT_INTERNAL_SECRET ?? '';
  const immediateEvents = parseImmediateEvents(process.env.AGENT_IMMEDIATE_EVENTS);

  let firedImmediately = false;
  if (immediateEvents.has(input.event) && MODAL_WEBHOOK_URL && AGENT_INTERNAL_SECRET) {
    // Fire-and-forget — the trigger is already queued in Redis as a fallback.
    fetch(MODAL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ space_id: input.spaceId, secret: AGENT_INTERNAL_SECRET }),
    }).catch(() => {
      // Trigger remains in Redis for the next sweep — no data loss.
    });
    firedImmediately = true;
  }

  await recordOutcome(kvUrl, kvToken, input, firedImmediately ? 'queued_modal' : 'queued');
  return { queued: true, firedImmediately, firstTouch, firstTouchReply, tourFollowUp };
}
