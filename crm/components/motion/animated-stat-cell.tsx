'use client';

import { AnimatedNumber } from '@/components/motion/animated-number';
import { STAT_NUMBER_COMPACT, TITLE_FONT } from '@/lib/typography';

/**
 * Compact stat cell with count-up animation. Mirrors the local StatCell
 * helpers used in the intake server pages, but as a client component so
 * the focal numeral can animate.
 */
export function AnimatedStatCell({
  label,
  value,
  format,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
}) {
  return (
    <div className="bg-background p-5">
      <p className={STAT_NUMBER_COMPACT} style={TITLE_FONT}>
        <AnimatedNumber value={value} format={format} />
      </p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
