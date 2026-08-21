/**
 * Pure aggregation helpers for AgentDraft send + outcome rows.
 *
 * Creating a draft is a send. These numbers record whether the message
 * went out or failed — not whether a realtor approved a queue item.
 *
 * Two consumers:
 *   1. `GET /api/agent/draft-stats` — realtor-scoped, single space.
 *   2. The broker dashboard's "Draft impact" card — brokerage-scoped, all
 *      spaces in the brokerage rolled up.
 *
 * Keeping the math here means both surfaces report the same numbers off the
 * same input. The route and the card are responsible for fetching the rows
 * (each scopes their query differently); this file only does math.
 *
 * Schema note: AgentDraft.status has no 'failed' value (CHECK is
 * pending/approved/dismissed/sent). Failed sends are written as
 * status='approved' + feedback_action='rejected' + outcome_signal='failed'.
 * Successful sends are status='sent' + feedback_action='approved'.
 * 'held' is leftover review-queue noise and does not count.
 */

export const DRAFT_STATS_WINDOW_DAYS = 30;

/** Written on new rows that attempted delivery and did not go out. */
export const DRAFT_FAILED_SIGNAL = 'failed';

export type FeedbackAction = 'approved' | 'edited_and_approved' | 'rejected' | 'held';
export type OutcomeSignal = 'deal_advanced' | 'none' | typeof DRAFT_FAILED_SIGNAL;

export interface DraftStatsRow {
  feedback_action: FeedbackAction | null;
  edit_distance: number | null;
  decision_ms: number | null;
  outcome_signal: OutcomeSignal | null;
  status?: string | null;
}

export interface DraftStats {
  windowDays: number;
  total: number;
  sent: number;
  failed: number;
  sentRate: number;
  /** @deprecated Alias of `sent`. Kept so the broker card type-checks. */
  approved: number;
  /** @deprecated Legacy edit-then-approve count. Auto-send writes 0. */
  editedAndApproved: number;
  /** @deprecated Alias of `failed`. */
  rejected: number;
  /** @deprecated Review-queue leftover. Not counted in `total`. */
  held: number;
  /** @deprecated Alias of `sentRate`. */
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

function isFailedRow(row: DraftStatsRow): boolean {
  if (row.outcome_signal === DRAFT_FAILED_SIGNAL) return true;
  if (row.feedback_action === 'rejected') return true;
  return false;
}

function isSentRow(row: DraftStatsRow): boolean {
  if (isFailedRow(row)) return false;
  if (row.status === 'sent') return true;
  return row.feedback_action === 'approved' || row.feedback_action === 'edited_and_approved';
}

/**
 * Roll AgentDraft rows into sent/failed stats. Inputs must already be
 * filtered to the desired window — this function trusts the caller's scope.
 *
 * Held / pending leftovers are ignored. They are not a success and they
 * are not a send failure; they are a review-queue artifact we no longer write.
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
    if (isFailedRow(row)) {
      rejected += 1;
    } else if (row.feedback_action === 'edited_and_approved') {
      editedAndApproved += 1;
      if (typeof row.edit_distance === 'number' && row.edit_distance > 0) {
        editDistances.push(row.edit_distance);
      }
    } else if (isSentRow(row)) {
      approved += 1;
    } else if (row.feedback_action === 'held') {
      held += 1;
    }

    if (typeof row.decision_ms === 'number' && row.decision_ms >= 0) {
      decisionMsList.push(row.decision_ms);
    }
    // Outcome attribution lives on a separate axis. A failed send never
    // landed → no deal to judge. A sent draft the cron hasn't labelled
    // yet → outcome_signal still null. 'failed' is a write-time delivery
    // mark, not a cron label.
    if (row.outcome_signal === 'deal_advanced' || row.outcome_signal === 'none') {
      outcomeCheckedCount += 1;
      if (row.outcome_signal === 'deal_advanced') outcomeAdvanced += 1;
    }
  }

  const sent = approved + editedAndApproved;
  const failed = rejected;
  const total = sent + failed;
  const sentRate = rate(sent, total);
  const editedRate = rate(editedAndApproved, total);
  const outcomeAdvancedRate = rate(outcomeAdvanced, outcomeCheckedCount);

  return {
    windowDays: DRAFT_STATS_WINDOW_DAYS,
    total,
    sent,
    failed,
    sentRate,
    approved,
    editedAndApproved,
    rejected,
    held,
    approvalRate: sentRate,
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
