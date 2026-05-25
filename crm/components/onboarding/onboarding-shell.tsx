'use client';

import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { OnboardingBrandMark } from './onboarding-brand-mark';
import { GHOST_PILL } from '@/lib/typography';

interface OnboardingShellProps {
  /** Zero-based index of the active step. */
  stepIndex: number;
  /** Total step count across the current path. */
  totalSteps: number;
  /** Must change per step to trigger AnimatePresence exit/enter. */
  stepKey: string;
  /** The rendered step content. */
  children: React.ReactNode;
  /** Optional back handler — rendered as a subtle top-left affordance. */
  onBack?: () => void;
}

/**
 * The shared onboarding surface.
 *
 * Theme-aware canvas with a soft brand-warm wash so the moment feels staged
 * but never saturated. The wash is barely-there in dark mode. Step content
 * fades in via AnimatePresence; progress dots track placement.
 */
export function OnboardingShell({ stepIndex, totalSteps, stepKey, children, onBack }: OnboardingShellProps) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Brand-warm wash — premium without saturation. Subtle in dark mode. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-orange-50/40 via-background to-orange-50/30 dark:from-orange-500/[0.04] dark:via-background dark:to-orange-500/[0.03]"
      />

      {/* Back button — top-left, ghost pill */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className={cn(GHOST_PILL, 'absolute left-5 top-5 z-20')}
        >
          ← Back
        </button>
      )}

      {/* Content */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-20">
        <OnboardingBrandMark />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={stepKey}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="mt-7 w-full max-w-3xl"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress dots */}
      {totalSteps > 1 && (
        <div className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => {
            const complete = i < stepIndex;
            const active = i === stepIndex;
            return (
              <motion.span
                key={i}
                aria-hidden
                className={cn(
                  'inline-block h-1.5 rounded-full',
                  active
                    ? 'bg-foreground'
                    : complete
                      ? 'bg-foreground/40'
                      : 'bg-foreground/15',
                )}
                animate={{ width: active ? 28 : 6 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
