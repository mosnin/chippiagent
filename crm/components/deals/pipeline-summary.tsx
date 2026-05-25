'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatCompact } from '@/lib/formatting';
import type { Deal, DealStage } from '@/lib/types';
import { dealHealth } from '@/lib/deals/health';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import {
  STAT_NUMBER_COMPACT,
  TITLE_FONT,
  BODY,
  SECTION_LABEL,
} from '@/lib/typography';
import type { BoardFocus } from './deals-page-client';

interface PipelineSummaryProps {
  slug: string;
  pipelineId: string;
  /** Which focus filter is currently active on the board. Drives cell
   *  pressed-state. */
  focus: BoardFocus;
  /** Toggle a focus on/off. The clicked cell becomes the page's filter
   *  for the kanban below; click again to clear. */
  onFocusChange: (next: BoardFocus) => void;
  /** Called from the narration line when the page is empty. */
  onAddDeal: () => void;
}

type StageWithDeals = DealStage & { deals: Deal[] };

interface PipelineStats {
  active: number;
  closingThisMonth: number;
  closingThisMonthValue: number;
  atRisk: number;
  wonThisMonth: number;
  wonThisMonthValue: number;
  /** A short Chippi narration that names the most-pressing fact. */
  narration: string;
  /** Click the narration to act on it. `null` if there's nothing to do. */
  narrationAction: 'filter-at-risk' | 'filter-closing' | 'add-deal' | null;
}

/**
 * Stat strip above the deals board.
 *
 * Answers the realtor's morning question — "what's actually moving, what's
 * stuck, and what closes this month?" — in four cells. Two of the cells
 * (At risk, Closing this month) are also filter triggers: clicking one
 * narrows the kanban below and toggles a pressed state on the cell. The
 * narration line is a button when there's an action attached to it; click
 * "1 deal hasn't moved in 14 days. Take a look." → board filters to that
 * deal. The page tells one story instead of two.
 */
export function PipelineSummary({
  slug,
  pipelineId,
  focus,
  onFocusChange,
  onAddDeal,
}: PipelineSummaryProps) {
  const [stages, setStages] = useState<StageWithDeals[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/stages?slug=${encodeURIComponent(slug)}&pipelineId=${encodeURIComponent(pipelineId)}`,
        );
        if (!res.ok) {
          if (!cancelled) setStages([]);
          return;
        }
        const data: StageWithDeals[] = await res.json();
        if (!cancelled) setStages(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setStages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug, pipelineId]);

  const stats: PipelineStats = useMemo(() => {
    const allDeals = stages.flatMap((s) => s.deals ?? []);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    let active = 0;
    let closingThisMonth = 0;
    let closingThisMonthValue = 0;
    let atRisk = 0;
    let wonThisMonth = 0;
    let wonThisMonthValue = 0;

    // Track the most-pressing line for the narration.
    let stuckCount = 0;
    let stuckMaxDays = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekOut = new Date(today);
    weekOut.setDate(weekOut.getDate() + 7);
    let closingThisWeek = 0;

    for (const d of allDeals) {
      const status = (d.status ?? 'active') as 'active' | 'won' | 'lost' | 'on_hold';
      const value = typeof d.value === 'number' ? d.value : 0;

      if (status === 'active') {
        active += 1;
        const close = d.closeDate ? new Date(d.closeDate as unknown as string) : null;
        if (close && !isNaN(close.getTime())) {
          if (close >= monthStart && close < monthEnd) {
            closingThisMonth += 1;
            closingThisMonthValue += value;
          }
          if (close >= today && close <= weekOut) {
            closingThisWeek += 1;
          }
        }
        const health = dealHealth(d);
        if (health.state !== 'on-track') {
          atRisk += 1;
          if (health.state === 'stuck') {
            stuckCount += 1;
            // Try to extract day count for the narration.
            const m = health.reason.match(/(\d+)\s+days?/);
            if (m) stuckMaxDays = Math.max(stuckMaxDays, parseInt(m[1], 10));
          }
        }
      } else if (status === 'won') {
        // closeDate or updatedAt — closeDate first; fall back to updatedAt.
        const ref = d.closeDate
          ? new Date(d.closeDate as unknown as string)
          : d.updatedAt
            ? new Date(d.updatedAt as unknown as string)
            : null;
        if (ref && !isNaN(ref.getTime()) && ref >= monthStart && ref < monthEnd) {
          wonThisMonth += 1;
          wonThisMonthValue += value;
        }
      }
    }

    // Compose Chippi's one-line narration. Pick the most-pressing fact.
    let narration = '';
    let narrationAction: PipelineStats['narrationAction'] = null;
    if (stuckCount > 0) {
      if (stuckCount === 1) {
        narration = stuckMaxDays > 0
          ? `1 deal hasn't moved in ${stuckMaxDays} days. Take a look.`
          : "1 deal is stuck. Take a look.";
      } else {
        narration = `${stuckCount} deals are stuck — they need a nudge.`;
      }
      narrationAction = 'filter-at-risk';
    } else if (closingThisWeek > 0) {
      narration =
        closingThisWeek === 1
          ? '1 deal is closing this week.'
          : `${closingThisWeek} deals are closing this week.`;
      narrationAction = 'filter-closing';
    } else if (closingThisMonth > 0) {
      narration =
        closingThisMonth === 1
          ? '1 deal closes this month. Keep it on track.'
          : `${closingThisMonth} deals close this month. Keep them on track.`;
      narrationAction = 'filter-closing';
    } else if (active === 0 && wonThisMonth === 0) {
      narration = 'Nothing in flight. Add a deal to get started.';
      narrationAction = 'add-deal';
    } else {
      narration = active === 1 ? '1 active deal. Steady.' : `${active} active deals. Steady.`;
      narrationAction = null;
    }

    return {
      active,
      closingThisMonth,
      closingThisMonthValue,
      atRisk,
      wonThisMonth,
      wonThisMonthValue,
      narration,
      narrationAction,
    };
  }, [stages]);

  function handleNarrationClick() {
    if (stats.narrationAction === 'filter-at-risk') onFocusChange(focus === 'at-risk' ? null : 'at-risk');
    else if (stats.narrationAction === 'filter-closing') onFocusChange(focus === 'closing-month' ? null : 'closing-month');
    else if (stats.narrationAction === 'add-deal') onAddDeal();
  }

  const NarrationEl = stats.narrationAction ? motion.button : motion.p;
  const narrationClasses = cn(
    'text-lg text-muted-foreground text-left transition-colors',
    stats.narrationAction && 'hover:text-foreground cursor-pointer',
    loading && 'opacity-60',
  );

  return (
    <div className="space-y-4">
      {/* Brand-voice narration line — the page's one sentence. Clickable
          when there's an action attached: stuck/at-risk → filter to those;
          closing this week or month → filter to closing; nothing in flight
          → open Add deal. The sentence and the screen become one thing. */}
      <NarrationEl
        type={stats.narrationAction ? 'button' : undefined}
        onClick={stats.narrationAction ? handleNarrationClick : undefined}
        className={narrationClasses}
        style={TITLE_FONT}
        layout
      >
        {loading ? ' ' : stats.narration}
      </NarrationEl>

      {/* 4-cell stat strip — paper-flat, hairline-divided. Two cells (At
          risk, Closing this month) are filter triggers: clicking selects
          and the cell presses in via motion.layoutId so the eye sees a
          continuous element move into a new state. Same vocabulary as the
          contact tab strip. */}
      <div
        className={cn(
          'grid grid-cols-2 md:grid-cols-4 gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70',
          loading && 'opacity-60',
        )}
      >
        <StatCell
          number={<AnimatedNumber value={stats.active} />}
          label="Active deals"
          sub="in flight"
        />
        <StatCell
          number={<AnimatedNumber value={stats.closingThisMonth} />}
          label="Closing this month"
          sub={
            stats.closingThisMonth > 0
              ? `${formatCompact(stats.closingThisMonthValue)} on the line`
              : 'no close dates this month'
          }
          selected={focus === 'closing-month'}
          onClick={
            stats.closingThisMonth > 0
              ? () => onFocusChange(focus === 'closing-month' ? null : 'closing-month')
              : undefined
          }
        />
        <StatCell
          number={<AnimatedNumber value={stats.atRisk} />}
          label="At risk"
          sub={stats.atRisk > 0 ? 'need attention' : 'all moving'}
          dim={stats.atRisk === 0}
          selected={focus === 'at-risk'}
          onClick={
            stats.atRisk > 0
              ? () => onFocusChange(focus === 'at-risk' ? null : 'at-risk')
              : undefined
          }
        />
        <StatCell
          number={<AnimatedNumber value={stats.wonThisMonth} />}
          label="Won this month"
          sub={
            stats.wonThisMonth > 0
              ? `${formatCompact(stats.wonThisMonthValue)} closed`
              : 'nothing closed yet'
          }
        />
      </div>
    </div>
  );
}

interface StatCellProps {
  number: React.ReactNode;
  label: string;
  sub: string;
  dim?: boolean;
  /** Filter triggers light up when active — motion.layoutId background
   *  slides between cells so the page reads as one connected control. */
  selected?: boolean;
  onClick?: () => void;
}

function StatCell({ number, label, sub, dim, selected, onClick }: StatCellProps) {
  const isInteractive = !!onClick;
  const Component = isInteractive ? 'button' : 'div';
  return (
    <Component
      type={isInteractive ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={isInteractive ? selected : undefined}
      className={cn(
        'relative bg-background p-5 text-left transition-colors',
        isInteractive && 'cursor-pointer hover:bg-foreground/[0.03]',
        // Selected wash sits behind the content so the AnimatedNumber stays
        // clean. The motion.span underneath provides the slide.
        selected && 'bg-foreground/[0.045]',
      )}
    >
      {selected && (
        <motion.span
          layoutId="deals-focus-cell"
          className="absolute inset-0 ring-1 ring-foreground/20 rounded-none pointer-events-none"
          transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
          aria-hidden
        />
      )}
      <p
        className={cn(
          STAT_NUMBER_COMPACT,
          'leading-none relative',
          dim && !selected && 'text-muted-foreground',
        )}
        style={TITLE_FONT}
      >
        {number}
      </p>
      <p className={cn(BODY, 'mt-2 relative')}>{label}</p>
      <p className={cn(SECTION_LABEL, 'mt-1 normal-case tracking-normal text-[11px] relative')}>
        {sub}
      </p>
    </Component>
  );
}
