'use client';

import { cn } from '@/lib/utils';

interface LeadScoreBarProps {
  score: number | null;
  showLabel?: boolean;
  className?: string;
}

export function LeadScoreBar({ score, showLabel = true, className }: LeadScoreBarProps) {
  if (score === null || score === undefined) return null;

  const pct = Math.max(0, Math.min(100, score));

  const color =
    pct >= 70
      ? 'bg-orange-500'
      : pct >= 40
      ? 'bg-amber-400'
      : 'bg-muted-foreground/30';

  const labelColor =
    pct >= 70
      ? 'text-orange-600 dark:text-orange-400'
      : pct >= 40
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-muted-foreground';

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden flex-shrink-0">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className={cn('text-[11px] font-medium tabular-nums', labelColor)}>
          {pct}
        </span>
      )}
    </div>
  );
}
