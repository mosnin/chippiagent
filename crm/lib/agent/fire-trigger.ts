/**
 * fireAgentTrigger — server-side helper for queueing an agent trigger.
 *
 * Extracted from app/api/agent/trigger so any server-side mutation route
 * (contacts.POST creating a lead, deal stage change, tour completion, etc.)
 * can fire a trigger without going through the public REST endpoint and its
 * Clerk auth. The route now does auth + delegates here.
 *
 * Behaviour mirrors the route exactly:
 *   1. Rate-limit per space-per-minute (capped at RATE_LIMIT).
 *   2. Dedupe within DEDUPE_WINDOW_S using the bucket pattern.
 *   3. RPUSH the trigger to `agent:triggers:{spaceId}` (FIFO queue).
 *   4. If event is in AGENT_IMMEDIATE_EVENTS and MODAL_WEBHOOK_URL is set,
 *      fire the Modal webhook immediately (fire-and-forget).
 *   5. Record the outcome to `agent:trigger:events:{spaceId}` for audit.
 *
 * Never throws — returns `{queued:false, reason}` instead. Callers in
 * mutation routes should not let a trigger-queue failure fail the parent
 * write; the parent operation is what the user asked for.
 */

import {
  isTriggerEvent,
  parseImmediateEvents,
  type TriggerEvent,
} from '@/lib/agent/trigger-policy';

const RATE_LIMIT = 20;
const RATE_WINDOW_S = 60;
const DEDUPE_WINDOW_S = Number(process.env.AGENT_TRIGGER_DEDUPE_WINDOW_S ?? '120');

export interface FireTriggerInput {
  spaceId: string;
  event: TriggerEvent;
  contactId?: string;
  dealId?: string;
}

export interface FireTriggerResult {
  queued: boolean;
  deduped?: boolean;
  firedImmediately?: boolean;
  reason?: string;
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

async function isDuplicate(
  kvUrl: string,
  kvToken: string,
  input: FireTriggerInput,
): Promise<boolean> {
  const key = `agent:trigger-dedupe:${input.spaceId}:${input.event}:${input.contactId ?? 'none'}:${input.dealId ?? 'none'}`;
  // SET NX EX in one atomic op. The key lives DEDUPE_WINDOW_S from THIS
  // event, so it is a true sliding window. The old floor(now/window) bucket
  // reset at fixed clock boundaries — two identical events that straddled a
  // boundary both got through — and its INCR+EXPIRE was also non-atomic.
  const res = await fetch(
    `${kvUrl}/set/${encodeURIComponent(key)}/1/EX/${Math.max(1, DEDUPE_WINDOW_S)}/NX`,
    { method: 'POST', headers: { Authorization: `Bearer ${kvToken}` } },
  );
  if (!res.ok) return false; // fail open — never drop a real trigger
  const { result } = (await res.json()) as { result: string | null };
  // 'OK' → key was absent → first occurrence. null → key existed → duplicate.
  return result === null;
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
  if (!kvUrl || !kvToken) {
    return { queued: false, reason: 'redis_not_configured' };
  }

  const allowed = await checkRateLimit(kvUrl, kvToken, input.spaceId);
  if (!allowed) {
    return { queued: false, reason: 'rate_limited' };
  }

  if (await isDuplicate(kvUrl, kvToken, input)) {
    await recordOutcome(kvUrl, kvToken, input, 'deduped');
    return { queued: true, deduped: true };
  }

  const trigger = JSON.stringify({
    event: input.event,
    contactId: input.contactId ?? null,
    dealId: input.dealId ?? null,
    spaceId: input.spaceId,
    queuedAt: new Date().toISOString(),
  });
  const key = `agent:triggers:${input.spaceId}`;

  const pushRes = await fetch(`${kvUrl}/rpush/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([trigger]),
  });
  if (!pushRes.ok) {
    return { queued: false, reason: 'redis_push_failed' };
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
  return { queued: true, firedImmediately };
}
