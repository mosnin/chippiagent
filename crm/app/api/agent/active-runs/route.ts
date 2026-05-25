/**
 * GET /api/agent/active-runs
 *
 * Returns the agent run IDs currently active for the caller's space.
 * Used by the ChippiActivityToast to discover autonomous runs in real
 * time without a per-run SSE subscription bound to a runId the UI
 * doesn't yet know.
 *
 * Active = the orchestrator emitted an "info" event for the run and
 * hasn't yet emitted a "complete" or "error" event. Entries older than
 * 15 minutes are pruned lazily on each read — a crashed Modal function
 * that never sent a terminal event won't pin the entry forever.
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Redis } from '@upstash/redis';
import { getSpaceForUser } from '@/lib/space';

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
});

const MAX_AGE_MS = 15 * 60 * 1000;

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const space = await getSpaceForUser(userId);
  if (!space) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const key = `agent:active-runs:${space.id}`;
  const cutoff = Date.now() - MAX_AGE_MS;

  // Prune anything older than the cutoff before reading.
  try {
    await redis.zremrangebyscore(key, 0, cutoff);
  } catch {
    // Cleanup failure is non-fatal — we'll still read whatever's there.
  }

  let runs: { runId: string; startedAt: number }[] = [];
  try {
    // ZRANGEBYSCORE with WITHSCORES gives pairs of [member, score, ...].
    const raw = (await redis.zrange(key, cutoff, '+inf', {
      byScore: true,
      withScores: true,
    })) as (string | number)[];
    for (let i = 0; i < raw.length; i += 2) {
      const runId = String(raw[i] ?? '');
      const score = Number(raw[i + 1] ?? 0);
      if (runId) runs.push({ runId, startedAt: score });
    }
  } catch {
    runs = [];
  }

  // Most recent first so the UI surfaces the freshest run.
  runs.sort((a, b) => b.startedAt - a.startedAt);

  return NextResponse.json({ runs });
}
