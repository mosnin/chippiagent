'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SECTION_LABEL, BODY_MUTED, BODY_COMPACT } from '@/lib/typography';
import { EASE_OUT, DURATION_BASE, DURATION_SLOW } from '@/lib/motion';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlanCardProps {
  task: string;
  steps: Array<{
    title: string;
    description: string;
  }>;
  isAnimating?: boolean;
  /** Index of the step currently being executed by the agent. Only shown
   *  when `isAnimating` is true; acts as a best-effort visual indicator. */
  activeStepIndex?: number;
}

// ─── Animation variants ───────────────────────────────────────────────────────

const STEP_VARIANTS = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION_BASE, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.12 },
  },
};

const ICON_VARIANTS = {
  idle: { scale: 1, rotate: 0 },
  thinking: {
    scale: [1, 1.12, 1],
    rotate: [0, 8, -8, 0],
    transition: {
      duration: 1.6,
      repeat: Infinity,
      repeatType: 'loop' as const,
      ease: 'easeInOut' as const,
    },
  },
  done: {
    scale: [1, 1.2, 1],
    transition: { duration: DURATION_SLOW, ease: EASE_OUT },
  },
};

const CHECK_VARIANTS = {
  hidden: { opacity: 0, scale: 0.5 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: DURATION_BASE, ease: EASE_OUT, delay: 0.05 },
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * PlanCard — shows a multi-step execution plan before the agent starts working.
 *
 * When `isAnimating` is true, steps stagger in one by one (80 ms apart) with a
 * fade + slide-up. After all steps have landed the header icon transitions from
 * a living sparkle pulse into a settled checkmark state, signalling to the
 * realtor that the plan is locked and execution is beginning.
 */
export function PlanCard({ task, steps, isAnimating = false, activeStepIndex }: PlanCardProps) {
  // Track how many steps are currently visible during the stagger sequence.
  const [visibleCount, setVisibleCount] = useState(isAnimating ? 0 : steps.length);
  // Whether we've finished the full stagger reveal.
  const [allVisible, setAllVisible] = useState(!isAnimating);

  useEffect(() => {
    if (!isAnimating) {
      setVisibleCount(steps.length);
      setAllVisible(true);
      return;
    }

    // Stagger steps in: each step waits 80 ms after the previous.
    const STAGGER_MS = 80;
    // Small initial delay so the card itself can fade in first.
    const INITIAL_DELAY_MS = 120;

    let current = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function scheduleNext() {
      if (current >= steps.length) {
        // All steps have been revealed — mark complete after one more beat.
        const doneTimer = setTimeout(() => setAllVisible(true), STAGGER_MS);
        timers.push(doneTimer);
        return;
      }
      const delay = INITIAL_DELAY_MS + current * STAGGER_MS;
      const t = setTimeout(() => {
        current += 1;
        setVisibleCount(current);
        scheduleNext();
      }, delay);
      timers.push(t);
    }

    // Kick off the stagger immediately.
    scheduleNext();

    return () => {
      timers.forEach(clearTimeout);
    };
    // Only re-run if `isAnimating` or the step count changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnimating, steps.length]);

  // Derive the icon animation state.
  const iconState = !isAnimating ? 'idle' : allVisible ? 'done' : 'thinking';

  return (
    <motion.div
      initial={isAnimating ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
      className="rounded-xl border border-border/70 bg-background overflow-hidden"
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3 border-b border-border/50">
        {/* Icon wrapper — animates between states */}
        <div className="relative flex-shrink-0 mt-0.5">
          <motion.div
            variants={ICON_VARIANTS}
            animate={iconState}
            className={cn(
              'w-6 h-6 rounded-md flex items-center justify-center transition-colors duration-300',
              allVisible
                ? 'bg-foreground/[0.06] text-foreground'
                : 'bg-muted text-muted-foreground',
            )}
          >
            <MessageCircle size={13} />
          </motion.div>

          {/* Checkmark badge — fades in once all steps are visible */}
          <AnimatePresence>
            {allVisible && (
              <motion.div
                key="check-badge"
                variants={CHECK_VARIANTS}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-foreground flex items-center justify-center"
              >
                <Check size={7} strokeWidth={3} className="text-background" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Label + task */}
        <div className="flex-1 min-w-0">
          <p className={cn(SECTION_LABEL, 'leading-none mb-1')}>Plan</p>
          <p className={cn(BODY_COMPACT, 'font-medium text-foreground leading-snug truncate')}>
            {task}
          </p>
        </div>
      </div>

      {/* ── Steps ──────────────────────────────────────────────────────── */}
      <ol className="px-4 py-3 space-y-0">
        <AnimatePresence initial={false}>
          {steps.slice(0, visibleCount).map((step, index) => (
            <motion.li
              key={index}
              variants={STEP_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative flex gap-3 py-2.5"
            >
              {/* Vertical timeline line — only on settled cards */}
              {allVisible && index < steps.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-[13px] top-[2.25rem] bottom-0 w-px bg-border/60"
                />
              )}

              {/* Step number badge */}
              {isAnimating && activeStepIndex === index ? (
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                  className={cn(
                    'flex-shrink-0 w-[26px] h-[26px] rounded-full flex items-center justify-center',
                    'text-[11px] font-semibold tabular-nums',
                    'bg-foreground/[0.08] text-foreground',
                    'transition-colors duration-300',
                  )}
                >
                  {index + 1}
                </motion.div>
              ) : (
                <div
                  className={cn(
                    'flex-shrink-0 w-[26px] h-[26px] rounded-full flex items-center justify-center',
                    'text-[11px] font-semibold tabular-nums',
                    'bg-muted text-muted-foreground',
                    'transition-colors duration-300',
                    allVisible && 'bg-foreground/[0.05] text-foreground/60',
                  )}
                >
                  {index + 1}
                </div>
              )}

              {/* Step text */}
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-[13px] font-medium text-foreground leading-snug">
                  {step.title}
                </p>
                <p className={cn(BODY_MUTED, 'text-xs leading-relaxed mt-0.5')}>
                  {step.description}
                </p>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>

        {/* Breathing placeholder rows while steps are still loading in */}
        {isAnimating && !allVisible && visibleCount < steps.length && (
          <li aria-hidden className="flex gap-3 py-2.5 opacity-30">
            <div className="flex-shrink-0 w-[26px] h-[26px] rounded-full bg-muted animate-pulse" />
            <div className="flex-1 min-w-0 pt-1.5 space-y-1.5">
              <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
              <div className="h-2.5 w-5/6 rounded bg-muted/70 animate-pulse" />
            </div>
          </li>
        )}
      </ol>
    </motion.div>
  );
}
