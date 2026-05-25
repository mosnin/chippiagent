/**
 * GET /api/cron/sweep-paused-runs
 *
 * Daily sweeper for AgentPausedRun rows. Without this, every paused-then-
 * abandoned chat turn accumulates indefinitely. The resume route only
 * marks rows expired lazily on access — abandoned runs that the realtor
 * never returns to never expire.
 *
 * Behavior:
 *   - Marks `status='expired'` on any pending row past its expiresAt.
 *   - Hard-deletes any row older than 30 days regardless of status.
 *
 * Auth: same Bearer CRON_SECRET pattern as the other cron routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

const HARD_DELETE_DAYS = 30;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.CRON_PAUSED_RUNS_DISABLED === 'true') {
    return NextResponse.json({ ok: true, skipped: 'kill-switch on' });
  }

  const nowIso = new Date().toISOString();
  const cutoffIso = new Date(Date.now() - HARD_DELETE_DAYS * 86_400_000).toISOString();

  // (1) Mark expired anything still pending past its expiresAt.
  const { data: expiredData, error: expireErr } = await supabase
    .from('AgentPausedRun')
    .update({ status: 'expired', updatedAt: nowIso })
    .eq('status', 'pending')
    .lt('expiresAt', nowIso)
    .select('id');

  if (expireErr) {
    logger.error('[cron.sweep-paused-runs] expire failed', { err: expireErr.message });
    return NextResponse.json({ error: 'expire failed' }, { status: 500 });
  }
  const expiredCount = (expiredData ?? []).length;

  // (2) Hard-delete anything older than HARD_DELETE_DAYS.
  const { data: deletedData, error: deleteErr } = await supabase
    .from('AgentPausedRun')
    .delete()
    .lt('createdAt', cutoffIso)
    .select('id');

  if (deleteErr) {
    logger.error('[cron.sweep-paused-runs] delete failed', { err: deleteErr.message });
    return NextResponse.json({ error: 'delete failed' }, { status: 500 });
  }

  const deletedCount = (deletedData ?? []).length;

  return NextResponse.json({
    ok: true,
    expired: expiredCount,
    deleted: deletedCount,
  });
}
