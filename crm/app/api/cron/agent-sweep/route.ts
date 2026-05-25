/**
 * GET /api/cron/agent-sweep
 *
 * Scheduled background sweep. Every 4 hours, walk all active spaces and
 * trigger the existing Modal `run_now_webhook` so the agent can prepare
 * AgentDraft records ahead of the realtor opening the app.
 *
 * IMPORTANT: This endpoint never sends email or SMS. It only triggers the
 * Modal agent path that produces AgentDraft rows with `status: 'pending'`.
 * The realtor approves drafts in the FocusCard; only that approval flow
 * fires outbound channels.
 *
 * Auth: Bearer ${CRON_SECRET} (matches broker-weekly-report).
 * Disable: set CRON_SWEEP_DISABLED=1 to short-circuit without doing work.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Env vars read at request time, not module load. Otherwise tests (and
// serverless cold-start ordering) lock these to whatever was set when the
// module was first imported, which makes the route untestable and slightly
// wrong when secrets are rotated.
function modalWebhookUrl(): string {
  return process.env.MODAL_WEBHOOK_URL ?? '';
}
function agentInternalSecret(): string {
  return process.env.AGENT_INTERNAL_SECRET ?? '';
}

// How long to wait between sweeps for the same space (idempotency guard).
const MIN_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours

// Skip a space when its pending-draft backlog is at or above this. The
// realtor isn't burning down what's already there; piling on doesn't help.
const PENDING_DRAFT_BACKLOG_LIMIT = 10;

// Cap on parallel Modal calls so a brokerage of 100 active realtors doesn't
// fire 100 simultaneous webhooks.
const MAX_CONCURRENCY = 8;

// How long a single Modal call is allowed to take before we move on. The
// Modal function itself has a 300s timeout; we don't want to block the cron.
const MODAL_TIMEOUT_MS = 30_000;

type SweepOutcome =
  | { spaceId: string; status: 'started' }
  | { spaceId: string; status: 'skipped'; reason: string }
  | { spaceId: string; status: 'errored'; error: string };

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/agent-sweep] CRON_SECRET env var is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Emergency kill switch.
  if (process.env.CRON_SWEEP_DISABLED) {
    console.log('[cron/agent-sweep] CRON_SWEEP_DISABLED is set — skipping sweep');
    return NextResponse.json({ status: 'disabled' });
  }

  if (!modalWebhookUrl() || !agentInternalSecret()) {
    console.error('[cron/agent-sweep] MODAL_WEBHOOK_URL or AGENT_INTERNAL_SECRET missing — cannot sweep');
    return NextResponse.json({ status: 'misconfigured', reason: 'Modal webhook not configured' }, { status: 500 });
  }

  const startedAt = Date.now();

  // ── 1. Fetch active spaces ─────────────────────────────────────────────
  const { data: spaces, error: spaceErr } = await supabase
    .from('Space')
    .select('id, slug')
    .in('stripeSubscriptionStatus', ['active', 'trialing']);
  if (spaceErr) {
    console.error('[cron/agent-sweep] Failed to load spaces', spaceErr);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  const allSpaces = (spaces ?? []) as { id: string; slug: string }[];
  if (allSpaces.length === 0) {
    return NextResponse.json({ totalSpaces: 0, started: 0, skipped: 0, errored: 0 });
  }

  // ── 2. Pre-compute pending-draft backlog per space (single query) ──────
  const spaceIds = allSpaces.map((s) => s.id);
  const { data: pendingRows, error: pendingErr } = await supabase
    .from('AgentDraft')
    .select('spaceId')
    .eq('status', 'pending')
    .in('spaceId', spaceIds)
    .limit(20000);
  if (pendingErr) {
    console.error('[cron/agent-sweep] Failed to count pending drafts', pendingErr);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }
  const pendingBySpace = new Map<string, number>();
  for (const row of (pendingRows ?? []) as { spaceId: string }[]) {
    pendingBySpace.set(row.spaceId, (pendingBySpace.get(row.spaceId) ?? 0) + 1);
  }

  // ── 3. Sweep with bounded concurrency ──────────────────────────────────
  const outcomes: SweepOutcome[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < allSpaces.length) {
      const idx = cursor++;
      const space = allSpaces[idx];
      try {
        const outcome = await sweepOne(space.id, pendingBySpace.get(space.id) ?? 0);
        outcomes.push(outcome);
      } catch (err) {
        outcomes.push({
          spaceId: space.id,
          status: 'errored',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, allSpaces.length) }, () => worker());
  await Promise.all(workers);

  // ── 4. Summarise ────────────────────────────────────────────────────────
  const started = outcomes.filter((o) => o.status === 'started').length;
  const skipped = outcomes.filter((o) => o.status === 'skipped');
  const errored = outcomes.filter((o) => o.status === 'errored');

  const skipReasons: Record<string, number> = {};
  for (const s of skipped) {
    if (s.status === 'skipped') skipReasons[s.reason] = (skipReasons[s.reason] ?? 0) + 1;
  }

  const summary = {
    totalSpaces: allSpaces.length,
    started,
    skipped: skipped.length,
    skipReasons,
    errored: errored.length,
    durationMs: Date.now() - startedAt,
  };
  console.log('[cron/agent-sweep] Sweep complete', summary);
  if (errored.length > 0) {
    console.error('[cron/agent-sweep] Errors', errored.slice(0, 10));
  }

  return NextResponse.json(summary);
}

// ── Helpers ─────────────────────────────────────────────────────────────

async function sweepOne(spaceId: string, pendingCount: number): Promise<SweepOutcome> {
  // Backlog guard
  if (pendingCount >= PENDING_DRAFT_BACKLOG_LIMIT) {
    return { spaceId, status: 'skipped', reason: 'backlog' };
  }

  // Idempotency: skip if we swept this space < MIN_INTERVAL_MS ago.
  const recently = await wasSweptRecently(spaceId);
  if (recently) {
    return { spaceId, status: 'skipped', reason: 'recent' };
  }

  // Fire the Modal webhook. Fire-and-forget semantics: we await the HTTP
  // response so we know whether Modal accepted the job, but we don't wait
  // for the agent run to finish.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODAL_TIMEOUT_MS);
  try {
    const internalSecret = agentInternalSecret();
    const res = await fetch(modalWebhookUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${internalSecret}`,
      },
      body: JSON.stringify({ space_id: spaceId, secret: internalSecret }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        spaceId,
        status: 'errored',
        error: `Modal returned ${res.status}: ${body.slice(0, 200)}`,
      };
    }
  } catch (err) {
    return {
      spaceId,
      status: 'errored',
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }

  // Mark swept so the next cron tick within MIN_INTERVAL_MS skips this space.
  await markSwept(spaceId);
  return { spaceId, status: 'started' };
}

/**
 * Idempotency tracking via Redis (Upstash KV). If KV isn't configured we
 * fail open — a duplicate sweep just produces idempotent "no new drafts"
 * runs from the agent, and Modal's own queue handles the rest.
 */
async function wasSweptRecently(spaceId: string): Promise<boolean> {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) return false;
  try {
    const key = sweepKey(spaceId);
    const res = await fetch(`${kvUrl}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    if (!res.ok) return false;
    const { result } = (await res.json()) as { result: string | null };
    return Boolean(result);
  } catch {
    return false;
  }
}

async function markSwept(spaceId: string): Promise<void> {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) return;
  try {
    const key = sweepKey(spaceId);
    const ttlSec = Math.floor(MIN_INTERVAL_MS / 1000);
    // SET key value EX ttl
    await fetch(`${kvUrl}/set/${encodeURIComponent(key)}/${Date.now()}?EX=${ttlSec}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}` },
    });
  } catch {
    // best-effort
  }
}

function sweepKey(spaceId: string): string {
  return `agent:sweep:last:${spaceId}`;
}
