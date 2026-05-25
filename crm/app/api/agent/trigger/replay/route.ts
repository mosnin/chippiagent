import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { triggerOpsAuthorized, triggerOpsEnabled } from '@/lib/agent/trigger-ops';
import { recordTriggerOpsAudit } from '@/lib/agent/trigger-audit';
import { isTriggerEvent, type TriggerEvent } from '@/lib/agent/trigger-policy';
import type { TriggerStatus } from '@/lib/agent/trigger-events';


const REPLAY_RATE_LIMIT = 20;
const REPLAY_RATE_WINDOW_S = 60;


async function replayIdempotencyGuard(input: {
  kvUrl: string;
  kvToken: string;
  spaceId: string;
  idempotencyKey?: string;
}): Promise<{ duplicate: boolean }> {
  const keyRaw = input.idempotencyKey?.trim();
  if (!keyRaw) return { duplicate: false };
  const safe = keyRaw.slice(0, 120);
  const key = `agent:trigger-replay-idem:${input.spaceId}:${safe}`;
  const res = await fetch(`${input.kvUrl}/incr/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.kvToken}` },
  });
  if (!res.ok) return { duplicate: false };
  const { result: count } = await res.json() as { result: number };
  if (count === 1) {
    await fetch(`${input.kvUrl}/expire/${encodeURIComponent(key)}/86400`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.kvToken}` },
    });
  }
  return { duplicate: count > 1 };
}

async function recordReplayOutcome(input: {
  kvUrl: string;
  kvToken: string;
  spaceId: string;
  event: TriggerEvent;
  contactId: string | null;
  dealId: string | null;
}): Promise<void> {
  const key = `agent:trigger:events:${input.spaceId}`;
  const payload = JSON.stringify({
    event: input.event,
    contactId: input.contactId,
    dealId: input.dealId,
    status: 'replayed',
    at: new Date().toISOString(),
  });
  await fetch(`${input.kvUrl}/lpush/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.kvToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([payload]),
  });
  await fetch(`${input.kvUrl}/ltrim/${encodeURIComponent(key)}/0/199`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.kvToken}` },
  });
}

interface TriggerEventLog {
  event: TriggerEvent;
  contactId: string | null;
  dealId: string | null;
  at: string;
  status?: TriggerStatus;
}

export async function POST(req: Request) {
  if (!triggerOpsEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!triggerOpsAuthorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) {
    return NextResponse.json({ replayed: false, reason: 'Redis not configured' }, { status: 500 });
  }


  const replayRateKey = `agent:trigger-replay-rate:${space.id}:${Math.floor(Date.now() / 60_000)}`;
  const replayRateRes = await fetch(`${kvUrl}/incr/${encodeURIComponent(replayRateKey)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}` },
  });
  if (replayRateRes.ok) {
    const { result: count } = await replayRateRes.json() as { result: number };
    if (count === 1) {
      await fetch(`${kvUrl}/expire/${encodeURIComponent(replayRateKey)}/${REPLAY_RATE_WINDOW_S * 2}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${kvToken}` },
      });
    }
    if (count > REPLAY_RATE_LIMIT) {
      return NextResponse.json({ replayed: false, reason: 'Too many replay requests — slow down' }, { status: 429 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const rawOffset = (body as { offset?: number | string }).offset ?? 0;
  const parsedOffset = Number(rawOffset);
  if (!Number.isFinite(parsedOffset) || parsedOffset < 0 || !Number.isInteger(parsedOffset)) {
    return NextResponse.json({ replayed: false, reason: 'offset must be a non-negative integer' }, { status: 400 });
  }
  if (parsedOffset > 1000) {
    return NextResponse.json({ replayed: false, reason: 'offset too large (max 1000)' }, { status: 400 });
  }
  const offset = parsedOffset;
  const allowReplayOfReplay = Boolean((body as { allowReplayOfReplay?: boolean }).allowReplayOfReplay);
  const idempotencyKey = typeof (body as { idempotencyKey?: unknown }).idempotencyKey === 'string'
    ? (body as { idempotencyKey: string }).idempotencyKey
    : undefined;
  const reason = typeof (body as { reason?: unknown }).reason === 'string'
    ? (body as { reason: string }).reason.trim().slice(0, 240)
    : null;

  const idem = await replayIdempotencyGuard({ kvUrl, kvToken, spaceId: space.id, idempotencyKey });
  if (idem.duplicate) {
    return NextResponse.json({ replayed: false, duplicate: true, reason: 'Duplicate replay request' }, { status: 409 });
  }

  const eventKey = `agent:trigger:events:${space.id}`;
  const rangeRes = await fetch(`${kvUrl}/lrange/${encodeURIComponent(eventKey)}/${offset}/${offset}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${kvToken}` },
  });
  if (!rangeRes.ok) {
    return NextResponse.json({ replayed: false, reason: 'Redis error reading event log' }, { status: 502 });
  }

  const rangeBody = await rangeRes.json() as { result?: string[] };
  const raw = rangeBody.result?.[0];
  if (!raw) {
    return NextResponse.json({ replayed: false, reason: 'No trigger event at offset' }, { status: 404 });
  }

  let entry: TriggerEventLog;
  try {
    entry = JSON.parse(raw) as TriggerEventLog;
  } catch {
    return NextResponse.json({ replayed: false, reason: 'Malformed trigger log entry' }, { status: 422 });
  }


  if (entry.status === 'replayed' && !allowReplayOfReplay) {
    return NextResponse.json({
      replayed: false,
      reason: 'Refusing to replay an already replayed entry without allowReplayOfReplay=true',
    }, { status: 409 });
  }

  if (!entry.event || !isTriggerEvent(entry.event)) {
    return NextResponse.json({ replayed: false, reason: 'Invalid trigger event in log' }, { status: 422 });
  }

  const queueKey = `agent:triggers:${space.id}`;
  const trigger = JSON.stringify({
    event: entry.event,
    contactId: entry.contactId ?? null,
    dealId: entry.dealId ?? null,
    spaceId: space.id,
    replayOf: entry.at,
    queuedAt: new Date().toISOString(),
  });

  const pushRes = await fetch(`${kvUrl}/rpush/${encodeURIComponent(queueKey)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kvToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([trigger]),
  });

  if (!pushRes.ok) {
    return NextResponse.json({ replayed: false, reason: 'Redis push failed' }, { status: 502 });
  }

  await recordReplayOutcome({ kvUrl, kvToken, spaceId: space.id, event: entry.event, contactId: entry.contactId ?? null, dealId: entry.dealId ?? null });
  await recordTriggerOpsAudit({
    kvUrl,
    kvToken,
    spaceId: space.id,
    action: 'replay_event',
    userId,
    detail: { offset, event: entry.event, reason },
  });

  return NextResponse.json({ replayed: true, event: entry.event, offset });
}

