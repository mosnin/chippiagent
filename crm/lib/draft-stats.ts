/**
 * Pure aggregation helpers for AgentDraft feedback + outcome rows.
 *
 * Two consumers:
 *   1. `GET /api/agent/draft-stats` — realtor-scoped, single space.
 *   2. The broker dashboard's "Draft impact" card — brokerage-scoped, all
 *      spaces in the brokerage rolled up.
 *
 * Keeping the math here means both surfaces report the same numbers off the
 * same input. The route and the card are responsible for fetching the rows
 * (each scopes their query differently); this file only does math.
 */

export const DRAFT_STATS_WINDOW_DAYS = 30;

export type FeedbackAction = 'approved' | 'edited_and_approved' | 'rejected' | 'held';
export type OutcomeSignal = 'deal_advanced' | 'none';

export interface DraftStatsRow {
  feedback_action: FeedbackAction | null;
  edit_distance: number | null;
  decision_ms: number | null;
  outcome_signal: OutcomeSignal | null;
}

export interface DraftStats {
  windowDays: number;
  total: number;
  approved: number;
  editedAndApproved: number;
  rejected: number;
  held: number;
  approvalRate: number;
  editedRate: number;
  medianEditDistance: number | null;
  medianDecisionMs: number | null;
  outcomeCheckedCount: number;
  outcomeAdvancedRate: number;
}

/**
 * Median of a numeric list. Returns null on empty so callers can disambiguate
 * "the median is zero" from "no data."
 */
function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Round a 0..1 ratio to two decimals. Zero denominator → 0, never NaN. */
function rate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100) / 100;
}

/**
 * Roll a list of decided AgentDraft rows into the stats shape both surfaces
 * bind to. Inputs must already be filtered to "feedback_action is not null"
 * and inside the desired window — this function trusts the caller's scope.
 */
export function aggregateDraftStats(rows: DraftStatsRow[]): DraftStats {
  let approved = 0;
  let editedAndApproved = 0;
  let rejected = 0;
  let held = 0;
  const editDistances: number[] = [];
  const decisionMsList: number[] = [];
  let outcomeCheckedCount = 0;
  let outcomeAdvanced = 0;

  for (const row of rows) {
    switch (row.feedback_action) {
      case 'approved':
        approved += 1;
        break;
      case 'edited_and_approved':
        editedAndApproved += 1;
        if (typeof row.edit_distance === 'number' && row.edit_distance > 0) {
          editDistances.push(row.edit_distance);
        }
        break;
      case 'rejected':
        rejected += 1;
        break;
      case 'held':
        held += 1;
        break;
      default:
        // Defensive: malformed row shouldn't poison the totals.
        break;
    }
    if (typeof row.decision_ms === 'number' && row.decision_ms >= 0) {
      decisionMsList.push(row.decision_ms);
    }
    // Outcome attribution lives on a separate axis from feedback_action. A
    // rejected draft never sent → no outcome_signal. A sent draft the cron
    // hasn't labelled yet → outcome_signal still null. Either way it's not
    // counted toward the outcome rate.
    if (row.outcome_signal === 'deal_advanced' || row.outcome_signal === 'none') {
      outcomeCheckedCount += 1;
      if (row.outcome_signal === 'deal_advanced') outcomeAdvanced += 1;
    }
  }

  const total = approved + editedAndApproved + rejected + held;
  const approvalRate = rate(approved + editedAndApproved, total);
  const editedRate = rate(editedAndApproved, total);
  const outcomeAdvancedRate = rate(outcomeAdvanced, outcomeCheckedCount);

  return {
    windowDays: DRAFT_STATS_WINDOW_DAYS,
    total,
    approved,
    editedAndApproved,
    rejected,
    held,
    approvalRate,
    editedRate,
    medianEditDistance: median(editDistances),
    medianDecisionMs: median(decisionMsList),
    outcomeCheckedCount,
    outcomeAdvancedRate,
  };
}

/** ISO timestamp for the start of the rolling 30-day window. */
export function draftStatsWindowStart(now: number = Date.now()): string {
  return new Date(now - DRAFT_STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
