'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type SeatPlan = 'starter' | 'team' | 'enterprise';

export interface SeatUsagePillProps {
  plan: SeatPlan;
  used: number;
  seatLimit: number | null;
  /** Shown on hover to explain what counts as a seat. */
  title?: string;
  className?: string;
  /** When true, render a compact inline variant (for forms). Default false = top-bar chip. */
  compact?: boolean;
}

const DEFAULT_TITLE =
  'Brokerage seats in use. Seats include active members plus pending invites.';

function isValidPlan(value: unknown): value is SeatPlan {
  return value === 'starter' || value === 'team' || value === 'enterprise';
}

/**
 * Narrow a possibly-undefined/malformed usage object (e.g. coming from
 * pre-migration server data) into a valid pill payload. Returns null when the
 * shape is unusable so callers can fail silently instead of rendering a broken
 * pill.
 */
export function normalizeSeatUsage(
  raw: unknown,
):
  | { plan: SeatPlan; used: number; seatLimit: number | null }
  | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as {
    plan?: unknown;
    used?: unknown;
    seatLimit?: unknown;
  };
  if (!isValidPlan(candidate.plan)) return null;
  if (typeof candidate.used !== 'number' || !Number.isFinite(candidate.used)) return null;
  const seatLimit =
    candidate.seatLimit === null
      ? null
      : typeof candidate.seatLimit === 'number' && Number.isFinite(candidate.seatLimit)
        ? candidate.seatLimit
        : undefined;
  if (seatLimit === undefined) return null;
  return {
    plan: candidate.plan,
    used: Math.max(0, Math.floor(candidate.used)),
    seatLimit,
  };
}

function tintClasses(ratio: number): { border: string; text: string; bar: string } {
  if (ratio >= 1) {
    return {
      border: 'border-rose-500/40 bg-rose-50/60 dark:bg-rose-500/10',
      text: 'text-rose-700 dark:text-rose-300',
      bar: 'bg-rose-500',
    };
  }
  if (ratio >= 0.8) {
    return {
      border: 'border-amber-500/40 bg-amber-50/60 dark:bg-amber-500/10',
      text: 'text-amber-700 dark:text-amber-300',
      bar: 'bg-amber-500',
    };
  }
  return {
    border: 'border-border bg-muted/40',
    text: 'text-muted-foreground',
    bar: 'bg-primary/70',
  };
}

export function SeatUsagePill({
  plan,
  used,
  seatLimit,
  title,
  className,
  compact = false,
}: SeatUsagePillProps) {
  // Defensive: if caller passed garbage values, fail silently per the pre-migration
  // resilience contract. This is a belt-and-braces check in addition to the
  // shell-level normalizeSeatUsage().
  if (
    !isValidPlan(plan) ||
    typeof used !== 'number' ||
    !Number.isFinite(used) ||
    (seatLimit !== null && (typeof seatLimit !== 'number' || !Number.isFinite(seatLimit)))
  ) {
    return null;
  }

  const safeUsed = Math.max(0, Math.floor(used));
  const tooltip = title ?? DEFAULT_TITLE;

  const sizing = compact
    ? 'h-6 gap-1.5 px-2 text-[11px]'
    : 'h-7 gap-2 px-2.5 text-xs';

  // Unlimited — enterprise plans.
  if (seatLimit === null) {
    return (
      <span
        title={tooltip}
        className={cn(
          'inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-50/60 font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 tabular-nums',
          sizing,
          className,
        )}
        data-slot="seat-usage-pill"
        data-plan={plan}
      >
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-emerald-500"
        />
        <span>
          {safeUsed} {safeUsed === 1 ? 'member' : 'members'}
          <span className="opacity-50"> &middot; </span>
          Enterprise
        </span>
      </span>
    );
  }

  const ratio = seatLimit > 0 ? safeUsed / seatLimit : 1;
  const tint = tintClasses(ratio);
  const barWidth = `${Math.min(100, Math.max(0, ratio * 100)).toFixed(1)}%`;

  return (
    <span
      title={tooltip}
      className={cn(
        'inline-flex items-center rounded-full border font-medium tabular-nums',
        sizing,
        tint.border,
        tint.text,
        className,
      )}
      data-slot="seat-usage-pill"
      data-plan={plan}
      data-ratio={ratio.toFixed(2)}
    >
      <span className="whitespace-nowrap">
        {safeUsed}
        <span className="opacity-50"> / </span>
        {seatLimit}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'h-1 overflow-hidden rounded-full bg-border/60',
          compact ? 'w-10' : 'w-12',
        )}
      >
        <span
          className={cn('block h-full rounded-full transition-all', tint.bar)}
          style={{ width: barWidth }}
        />
      </span>
    </span>
  );
}
