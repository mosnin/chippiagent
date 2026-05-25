/**
 * Deal health + attention helpers.
 *
 * Pure functions so they're easy to test and share between the kanban card,
 * the pipeline strips, and (later) the Today inbox.
 *
 * Health is deliberately simple — three states only — because realtors don't
 * think in probability percentages. A deal is either cruising, needs a nudge,
 * or has gone cold.
 */

import type { Deal } from '@/lib/types';

export type DealHealth = 'on-track' | 'at-risk' | 'stuck';

export interface DealHealthMeta {
  state: DealHealth;
  /** Short human reason — shown in tooltip or under card if we want to explain. */
  reason: string;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Midnight today in local time — used as the reference point for day-based diffs. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / MS_PER_DAY);
}

/**
 * Classify a single deal's health based on signals we already have:
 *   - stuck:   active deal sitting in the same stage for 30+ days, OR past its
 *              expected close date by 3+ days without being marked won/lost.
 *   - at-risk: active deal sitting 15-29 days in stage, OR follow-up is
 *              overdue, OR close date is within the next 3 days.
 *   - on-track: everything else that's active.
 *
 * Won / lost / on-hold deals always return 'on-track' — they aren't in flight.
 */
// stageChangedAt is optional in the input so callers that pre-date the column
// (broker pipeline, morning routes, old tests) keep compiling. Internally we
// prefer it when present and fall back to updatedAt when not.
type DealHealthInput = {
  status: Deal['status'];
  stageChangedAt?: Deal['stageChangedAt'];
  updatedAt?: Deal['updatedAt'];
  closeDate: Deal['closeDate'];
  followUpAt: Deal['followUpAt'];
  nextAction: Deal['nextAction'];
  nextActionDueAt: Deal['nextActionDueAt'];
};

export function dealHealth(deal: DealHealthInput): DealHealthMeta {
  if (deal.status !== 'active') return { state: 'on-track', reason: '' };

  const today = startOfToday();

  // Days the deal has sat in its current stage. `stageChangedAt` is bumped by
  // PATCH /api/deals/[id] whenever stageId changes (and by POST /api/deals
  // when the deal is first created). Pre-migration rows were backfilled to
  // updatedAt so daysInStage isn't null for old data — but `updatedAt` is a
  // misleading fallback (any field edit bumps it), so we prefer null over
  // wrong, and fall back to updatedAt only if stageChangedAt is missing.
  const stageRef = deal.stageChangedAt
    ? new Date(deal.stageChangedAt as unknown as string)
    : deal.updatedAt
      ? new Date(deal.updatedAt as unknown as string)
      : null;
  const stageDays = stageRef && !isNaN(stageRef.getTime())
    ? daysBetween(today, new Date(stageRef.getFullYear(), stageRef.getMonth(), stageRef.getDate()))
    : null;

  // Expected close date — overdue means something the realtor expected to close
  // and didn't. Real deal blockers live here.
  const close = deal.closeDate ? new Date(deal.closeDate) : null;
  const closeDays = close && !isNaN(close.getTime())
    ? daysBetween(new Date(close.getFullYear(), close.getMonth(), close.getDate()), today)
    : null;

  // Follow-up overdue means the realtor committed to doing something and hasn't.
  const followUp = deal.followUpAt ? new Date(deal.followUpAt) : null;
  const followUpOverdue = !!(followUp && !isNaN(followUp.getTime()) && followUp.getTime() < today.getTime());

  // Realtor-authored next action that's past its due date — a strong
  // "this specific deal is being ignored" signal.
  const nextDue = deal.nextActionDueAt ? new Date(deal.nextActionDueAt) : null;
  const nextActionOverdue = !!(deal.nextAction && nextDue && !isNaN(nextDue.getTime()) && nextDue.getTime() < today.getTime());

  // Stuck first — most urgent
  if (stageDays != null && stageDays >= 30) {
    return { state: 'stuck', reason: `${stageDays} days in this stage` };
  }
  if (closeDays != null && closeDays <= -3) {
    return { state: 'stuck', reason: `expected close was ${Math.abs(closeDays)} days ago` };
  }

  // At risk — needs a nudge
  if (stageDays != null && stageDays >= 15) {
    return { state: 'at-risk', reason: `${stageDays} days in this stage` };
  }
  if (nextActionOverdue) {
    return { state: 'at-risk', reason: 'next action overdue' };
  }
  if (followUpOverdue) {
    return { state: 'at-risk', reason: 'follow-up overdue' };
  }
  if (closeDays != null && closeDays >= 0 && closeDays <= 3) {
    return { state: 'at-risk', reason: closeDays === 0 ? 'closing today' : `closing in ${closeDays} day${closeDays === 1 ? '' : 's'}` };
  }

  return { state: 'on-track', reason: '' };
}

/**
 * Surface the deal's "what's next" for the card and Today inbox.
 *
 * Priority:
 *   1. Explicit `nextAction` — realtor typed it, respect it.
 *   2. Follow-up date — "follow up today / overdue / in 3 days".
 *   3. Close date — "closing today / in 5 days".
 *   4. null — card falls back to the deal title.
 *
 * The returned `dueAt` is used by the Today inbox to flag overdue items.
 */
export function inferNextAction(
  deal: Pick<Deal, 'status' | 'followUpAt' | 'closeDate' | 'nextAction' | 'nextActionDueAt'>,
): { label: string; dueAt: Date | null } | null {
  if (deal.status !== 'active') return null;

  const today = startOfToday();

  // 1. Realtor-authored next action wins.
  if (deal.nextAction && deal.nextAction.trim()) {
    return {
      label: deal.nextAction.trim(),
      dueAt: deal.nextActionDueAt ? new Date(deal.nextActionDueAt) : null,
    };
  }

  // 2. Follow-up fallback.
  const followUp = deal.followUpAt ? new Date(deal.followUpAt) : null;
  if (followUp && !isNaN(followUp.getTime())) {
    const days = daysBetween(new Date(followUp.getFullYear(), followUp.getMonth(), followUp.getDate()), today);
    if (days < 0) return { label: `Follow up — ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`, dueAt: followUp };
    if (days === 0) return { label: 'Follow up today', dueAt: followUp };
    if (days <= 7) return { label: `Follow up in ${days} day${days === 1 ? '' : 's'}`, dueAt: followUp };
  }

  // 3. Close-date fallback.
  const close = deal.closeDate ? new Date(deal.closeDate) : null;
  if (close && !isNaN(close.getTime())) {
    const days = daysBetween(new Date(close.getFullYear(), close.getMonth(), close.getDate()), today);
    if (days < 0) return { label: `Closing date passed ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`, dueAt: close };
    if (days === 0) return { label: 'Closing today', dueAt: close };
    if (days <= 14) return { label: `Closing in ${days} day${days === 1 ? '' : 's'}`, dueAt: close };
  }

  return null;
}

/**
 * Partition active deals into the three attention strips shown above the
 * board: closing this week, at-risk/stuck, and waiting on the realtor.
 *
 * A deal can appear in multiple buckets — e.g. a deal closing this week with
 * an overdue follow-up is both "closing" and "waiting on me". We dedupe only
 * within each bucket; the card can live in more than one strip.
 */
export function classifyForStrips<T extends Pick<Deal, 'status' | 'updatedAt' | 'closeDate' | 'followUpAt' | 'id' | 'nextAction' | 'nextActionDueAt'>>(deals: T[]): {
  closingThisWeek: T[];
  atRisk: T[];
  waitingOnMe: T[];
} {
  const today = startOfToday();
  const weekOut = new Date(today);
  weekOut.setDate(weekOut.getDate() + 7);

  const closingThisWeek: T[] = [];
  const atRisk: T[] = [];
  const waitingOnMe: T[] = [];

  for (const d of deals) {
    if (d.status !== 'active') continue;

    // Closing this week: closeDate today through 7 days out.
    if (d.closeDate) {
      const close = new Date(d.closeDate);
      if (!isNaN(close.getTime()) && close.getTime() >= today.getTime() && close.getTime() <= weekOut.getTime()) {
        closingThisWeek.push(d);
      }
    }

    // At risk / stuck per health flag.
    const { state } = dealHealth(d);
    if (state !== 'on-track') {
      atRisk.push(d);
    }

    // Waiting on me: follow-up overdue.
    if (d.followUpAt) {
      const fu = new Date(d.followUpAt);
      if (!isNaN(fu.getTime()) && fu.getTime() < today.getTime()) {
        waitingOnMe.push(d);
      }
    }
  }

  return { closingThisWeek, atRisk, waitingOnMe };
}

export const HEALTH_META: Record<DealHealth, { label: string; dotClass: string; textClass: string }> = {
  'on-track': {
    label: 'On track',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-700 dark:text-emerald-400',
  },
  'at-risk': {
    label: 'At risk',
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-700 dark:text-amber-400',
  },
  stuck: {
    label: 'Stuck',
    dotClass: 'bg-red-500',
    textClass: 'text-red-700 dark:text-red-400',
  },
};
