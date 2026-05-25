import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import {
  aggregateDraftStats,
  draftStatsWindowStart,
  type DraftStatsRow,
} from '@/lib/draft-stats';

/**
 * GET /api/agent/draft-stats
 *
 * Tells the realtor (and the agent itself) how its drafts have actually been
 * landing. Two layers of signal:
 *
 *   - Input quality (Phase 12): `feedback_action`, `edit_distance`, `decision_ms`
 *     — did the realtor approve / edit / reject the draft. Lives in the
 *     `approved`/`editedAndApproved`/`rejected`/`held` counts and the rates
 *     derived from them.
 *   - Outcome attribution (Phase 13): `outcome_signal`, `outcome_checked_at`
 *     — for sent drafts, did the linked deal advance afterwards. Lives in
 *     `outcomeAdvancedRate` and `outcomeCheckedCount`. The cron at
 *     /api/cron/draft-outcomes labels each sent draft once.
 *
 * `outcomeAdvancedRate` is a correlation, not causation. Read it as "share of
 * sent drafts where the deal moved within a week of sending" — useful as a
 * relative ranking signal across prompt versions, not a hard scoreboard.
 *
 * Window: rolling 30 days, fixed.
 *
 * Math lives in `lib/draft-stats.ts` so the broker dashboard's "Draft impact"
 * card reports identical numbers from the same shape.
 *
 * Read-only. No DB writes. No outbound side effects.
 */

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('AgentDraft')
    .select('feedback_action, edit_distance, decision_ms, outcome_signal')
    .eq('spaceId', space.id)
    .not('feedback_action', 'is', null)
    .gte('createdAt', draftStatsWindowStart());

  if (error) throw error;

  const stats = aggregateDraftStats((data ?? []) as DraftStatsRow[]);
  return NextResponse.json(stats);
}
