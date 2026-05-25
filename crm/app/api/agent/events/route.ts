/**
 * POST /api/agent/events
 *
 * Receives real-time event updates FROM the Modal agent and stores them
 * in Upstash Redis. The SSE endpoint (/api/agent/stream) reads from these
 * lists to stream live progress to the UI.
 *
 * Secured with AGENT_INTERNAL_SECRET — fails loudly if secret is not set
 * in production so misconfiguration is caught at startup, not at runtime.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
});

const AGENT_INTERNAL_SECRET = process.env.AGENT_INTERNAL_SECRET ?? '';
const VALID_TYPES = new Set(['info', 'action', 'draft', 'complete', 'error', 'warning']);

function eventKey(spaceId: string, runId: string): string {
  return `agent:stream:${spaceId}:${runId}`;
}

export async function POST(req: NextRequest) {
  // Fail loudly on missing secret so misconfiguration surfaces immediately
  if (!AGENT_INTERNAL_SECRET) {
    console.error('[agent/events] AGENT_INTERNAL_SECRET is not configured');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }

  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${AGENT_INTERNAL_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { spaceId, runId, type, message, agentType, metadata } = body;

  if (!spaceId || !runId || !type || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Sanitise event type — reject unknown types rather than forwarding them
  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
  }

  const event = JSON.stringify({
    type,
    message: String(message).slice(0, 1_000), // cap to prevent huge payloads reaching browser
    agentType: agentType ? String(agentType).slice(0, 50) : '',
    metadata: metadata ?? {},
    ts: Date.now(),
  });

  const key = eventKey(spaceId, runId);

  await redis.rpush(key, event);
  await redis.ltrim(key, -500, -1);
  await redis.expire(key, 7_200);

  // Maintain an active-runs index per space so the UI can discover
  // autonomous runs as they happen. ZSET keyed by timestamp so stale
  // entries can be pruned by score; ZADD is idempotent on re-receipt of
  // an info event.
  const activeKey = `agent:active-runs:${spaceId}`;
  if (type === 'info') {
    await redis.zadd(activeKey, { score: Date.now(), member: runId });
    await redis.expire(activeKey, 7_200);
  } else if (type === 'complete' || type === 'error') {
    await redis.zrem(activeKey, runId);
  }

  return NextResponse.json({ ok: true });
}
