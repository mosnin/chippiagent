'use client';

import { formatCompact as formatCurrency } from '@/lib/formatting';
import { STAT_NUMBER, TITLE_FONT, CAPTION, H3 } from '@/lib/typography';
import { AnimatedNumber } from '@/components/motion/animated-number';

// Re-export shadcn chart primitives
export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
export type { ChartConfig } from '@/components/ui/chart';

export { formatCurrency };

// Paper-flat chart palette — graytones only, no rainbow.
// Use these as Cell fills when a chart has multiple categories.
export const PAPER_SERIES = [
  'hsl(var(--foreground))',
  'hsl(var(--muted-foreground))',
  'hsl(var(--muted-foreground) / 0.6)',
  'hsl(var(--muted-foreground) / 0.4)',
  'hsl(var(--muted-foreground) / 0.25)',
] as const;

export const PAPER_FOREGROUND = 'hsl(var(--foreground))';
export const PAPER_MUTED = 'hsl(var(--muted-foreground))';
export const PAPER_GRID = 'hsl(var(--muted-foreground) / 0.25)';

// Stat cell — for use inside the connected stat strip (gap-px, bg-border/70).
// Wrap in a parent: <div className="grid grid-cols-X gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70">
//
// Numbers render in the focal serif (TITLE_FONT) per the typography rules so
// they read as data, not labels.
export function StatCell({
  label,
  value,
  sub,
  format,
}: {
  label: string;
  value: string | number;
  sub?: string;
  /** When `value` is numeric, an optional formatter (e.g. `formatCompact`). */
  format?: (n: number) => string;
}) {
  return (
    <div className="bg-background p-5">
      <p className={STAT_NUMBER} style={TITLE_FONT}>
        {typeof value === 'number' ? (
          <AnimatedNumber value={value} format={format} />
        ) : (
          value
        )}
      </p>
      <p className={`${CAPTION} mt-1`}>{label}</p>
      {sub && (
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">{sub}</p>
      )}
    </div>
  );
}

// Chart section — paper-flat surface for charts.
// Title uses H3 (card heading) and sub uses caption-tone muted text so the
// type hierarchy is consistent across analytics surfaces.
export function ChartSection({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background p-5">
      <p className={H3}>{title}</p>
      {sub && <p className={`${CAPTION} mt-0.5 mb-4`}>{sub}</p>}
      {!sub && <div className="mb-4" />}
      <div className="overflow-x-auto -mx-1 px-1">{children}</div>
    </div>
  );
}
