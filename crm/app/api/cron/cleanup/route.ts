/**
 * GET /api/cron/cleanup
 *
 * Triggered once per day at 03:00 UTC by Vercel Cron (see vercel.json).
 * Calls the Postgres cleanup_agent_data() function which batches-deletes
 * stale rows from ExecutionStep, AgentTask, AgentMemory, ArtifactVersion,
 * and Artifact — capped at 1 000 rows per table per call to avoid long
 * locks. Backlogs drain over successive daily runs.
 *
 * Auth: requires Authorization: Bearer <CRON_SECRET> header. Vercel Cron
 * injects this automatically when CRON_SECRET is set in project env vars.
 * Returns 401 immediately if the header is absent or wrong.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Run cleanup ───────────────────────────────────────────────────────────
  const { data, error } = await supabase.rpc('cleanup_agent_data');

  if (error) {
    logger.error('[cron.cleanup] cleanup_agent_data RPC failed', { err: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logger.info('[cron.cleanup] cleanup complete', { result: data });

  return NextResponse.json({ ok: true, ...data });
}
