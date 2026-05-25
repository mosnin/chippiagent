'use client';

/**
 * GeneratingState — the waiting surface shown while Studio generates an
 * asset. Soft, slowly-drifting blurred glows with a slow sheen sweep behind
 * a crisp status line. Calm and premium; the blur keeps the wait from
 * reading as a hard skeleton. Used by Create and Edit.
 */

import { motion } from 'framer-motion';

export function GeneratingState({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border/60 bg-muted/20">
      {/* Drifting blurred glows — soft depth behind the status line. */}
      <motion.div
        aria-hidden
        className="absolute left-[12%] top-[18%] h-2/3 w-2/3 rounded-full bg-foreground/[0.07] blur-3xl"
        animate={{ x: ['-12%', '20%', '-12%'], y: ['-8%', '16%', '-8%'], scale: [1, 1.2, 1] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="absolute bottom-[14%] right-[10%] h-1/2 w-1/2 rounded-full bg-foreground/[0.05] blur-3xl"
        animate={{ x: ['8%', '-16%', '8%'], y: ['6%', '-12%', '6%'], scale: [1.1, 0.9, 1.1] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Slow sheen sweep. */}
      <motion.div
        aria-hidden
        className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent blur-xl"
        animate={{ x: ['-180%', '480%'] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.7 }}
      />
      <div className="relative flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
