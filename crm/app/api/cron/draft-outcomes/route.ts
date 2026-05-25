/**
 * GET /api/cron/draft-outcomes
 *
 * Daily sweep that closes the feedback loop on sent AgentDrafts: did the
 * deal move after we sent the message?
 *
 * Scans AgentDraft rows where:
 *   - status = 'sent'
 *   - outcome_signal IS NULL  (not yet labelled)
 *   - updatedAt BETWEEN now - 8 days AND now - 1 day
 *
 * The 1-day floor gives the deal a day to move before we judge it. The 8-day
 * ceiling drops drafts older than a week — if the deal hasn't advanced in a
 * week, the cause is something else (or the draft simply didn't matter), and
 * we don't want this scan to grow unbounded across the table's lifetime.
 *
 * For each draft: if it has a `dealId`, look up the deal. If
 *   - the deal still exists, AND
 *   - the deal's stage is NOT terminal (DealStage.kind != 'closed' AND
 *     Deal.status NOT IN ('won','lost')), AND
 *   - the deal's stageChangedAt is strictly later than the draft's updatedAt,
 * then the draft is marked 'deal_advanced'. Otherwise 'none'.
 *
 * IMPORTANT — what this signal is and isn't: 'deal_advanced' is correlation,
 * not causation. Multiple drafts can fire near a single stage advance, and
 * the realtor can advance by hand. Read it as "drafts that lined up with deal
 * progress" — useful as a relative ranking signal, not a hard scoreboard.
 *
 * Auth: Bearer ${CRON_SECRET} (matches agent-sweep, broker-weekly-report).
 * Disable: set CRON_OUTCOMES_DISABLED=1 to short-circuit.
 *
 * Never sends email or SMS. Read-mostly; only writes outcome_signal /
 * outcome_checked_at on AgentDraft.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Window edges. Adjust here, not at the call site.
const CHECK_DELAY_MS = 24 * 60 * 60 * 1000;        // wait 1 day before judging
const CHECK_HORIZON_MS = 8 * 24 * 60 * 60 * 1000;  // stop looking back after 8 days
const BATCH_CAP = 200;                              // rows per run

// Terminal deal states. A deal that's already won or lost can't "advance" in a
// meaningful sense; same for a stage marked closed. We mark the outcome 'none'
// for these rather than 'deal_advanced' even if stageChangedAt happens to be
// later — closing IS a stage change, but it's not the kind the agent helped
// with after the fact.
const TERMINAL_DEAL_STATUSES = new Set(['won', 'lost']);
const TERMINAL_STAGE_KIND = 'closed';

type DraftRow = {
  id: string;
  spaceId: string;
  dealId: string | null;
  updatedAt: string;
};

type DealRow = {
  id: string;
  status: string;
  stageId: string | null;
  stageChangedAt: string | null;
  updatedAt: string;
};

type StageRow = { id: string; kind: string | null };

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/draft-outcomes] CRON_SECRET env var is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.CRON_OUTCOMES_DISABLED) {
    console.log('[cron/draft-outcomes] CRON_OUTCOMES_DISABLED is set — skipping');
    return NextResponse.json({ status: 'disabled' });
  }

  const startedAt = Date.now();
  const now = Date.now();
  const lowerBound = new Date(now - CHECK_HORIZON_MS).toISOString();
  const upperBound = new Date(now - CHECK_DELAY_MS).toISOString();

  // ── 1. Pull candidate drafts ─────────────────────────────────────────────
  const { data: drafts, error: draftsErr } = await supabase
    .from('AgentDraft')
    .select('id, spaceId, dealId, updatedAt')
    .eq('status', 'sent')
    .is('outcome_signal', null)
    .gte('updatedAt', lowerBound)
    .lte('updatedAt', upperBound)
    .order('updatedAt', { ascending: true })
    .limit(BATCH_CAP);

  if (draftsErr) {
    console.error('[cron/draft-outcomes] Failed to load drafts', draftsErr);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  const draftRows = (drafts ?? []) as DraftRow[];
  if (draftRows.length === 0) {
    return NextResponse.json({
      processed: 0,
      advanced: 0,
      none: 0,
      durationMs: Date.now() - startedAt,
    });
  }

  // ── 2. Pull the deals those drafts reference, in one query ───────────────
  const dealIds = Array.from(
    new Set(draftRows.map((d) => d.dealId).filter((id): id is string => Boolean(id))),
  );

  const dealsById = new Map<string, DealRow>();
  const stageKindsById = new Map<string, string | null>();

  if (dealIds.length > 0) {
    const { data: deals, error: dealsErr } = await supabase
      .from('Deal')
      .select('id, status, stageId, stageChangedAt, updatedAt')
      .in('id', dealIds);
    if (dealsErr) {
      console.error('[cron/draft-outcomes] Failed to load deals', dealsErr);
      return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
    }
    for (const d of (deals ?? []) as DealRow[]) dealsById.set(d.id, d);

    const stageIds = Array.from(
      new Set(
        Array.from(dealsById.values())
          .map((d) => d.stageId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (stageIds.length > 0) {
      const { data: stages, error: stagesErr } = await supabase
        .from('DealStage')
        .select('id, kind')
        .in('id', stageIds);
      if (stagesErr) {
        console.error('[cron/draft-outcomes] Failed to load stages', stagesErr);
        return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
      }
      for (const s of (stages ?? []) as StageRow[]) stageKindsById.set(s.id, s.kind);
    }
  }

  // ── 3. Classify and update each draft ────────────────────────────────────
  // We update one row at a time. Batch volume is bounded (BATCH_CAP=200), and
  // a single failed update shouldn't poison the whole sweep.
  let advanced = 0;
  let none = 0;
  let errored = 0;
  const checkedAt = new Date().toISOString();

  for (const draft of draftRows) {
    const signal = classifyDraft(draft, dealsById, stageKindsById);

    const { error: updErr } = await supabase
      .from('AgentDraft')
      .update({
        outcome_signal: signal,
        outcome_checked_at: checkedAt,
      })
      .eq('id', draft.id)
      .is('outcome_signal', null); // race guard: don't clobber a value set elsewhere

    if (updErr) {
      errored += 1;
      console.error('[cron/draft-outcomes] Failed to update draft', { id: draft.id, error: updErr });
      continue;
    }

    if (signal === 'deal_advanced') advanced += 1;
    else none += 1;
  }

  const summary = {
    processed: draftRows.length,
    advanced,
    none,
    errored,
    durationMs: Date.now() - startedAt,
  };
  console.log('[cron/draft-outcomes] Sweep complete', summary);
  return NextResponse.json(summary);
}

function classifyDraft(
  draft: DraftRow,
  dealsById: Map<string, DealRow>,
  stageKindsById: Map<string, string | null>,
): 'deal_advanced' | 'none' {
  if (!draft.dealId) return 'none';
  const deal = dealsById.get(draft.dealId);
  if (!deal) return 'none'; // deal deleted

  if (TERMINAL_DEAL_STATUSES.has(deal.status)) return 'none';

  const stageKind = deal.stageId ? stageKindsById.get(deal.stageId) ?? null : null;
  if (stageKind === TERMINAL_STAGE_KIND) return 'none';

  // The "advance" signal: the deal's stage actually changed at some point
  // strictly after we sent the draft. Falls back to none if the deal has
  // never had a recorded stage change (stageChangedAt is null on rows that
  // haven't moved since the column was introduced).
  if (!deal.stageChangedAt) return 'none';
  if (Date.parse(deal.stageChangedAt) <= Date.parse(draft.updatedAt)) return 'none';

  return 'deal_advanced';
}
