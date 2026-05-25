'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Thinking indicator shown while Chippi is mid-turn.
 *
 * The whole indicator is one alive line: the current action text shimmers
 * through `chippi-thinking-shimmer`, transitions smoothly when the action
 * changes ("Thinking…" → "Reading HubSpot…" → "Drafting…"), and gets
 * out of the way the moment real text starts streaming.
 *
 * There are no separate pulsing dots — the text IS the indicator. Reasoning
 * tokens (when the model emits them) expand below via a small chevron.
 *
 * Parent contract: render this only while `currentAction || streamingReasoning`.
 * The indicator does not invent a fallback action — if both are empty the
 * caller should hide it.
 */
export function ThinkingIndicator({
  currentAction,
  streamingReasoning,
  className,
}: {
  currentAction?: string | null;
  streamingReasoning?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const action = currentAction?.trim() || null;
  const hasReasoning = Boolean(streamingReasoning?.trim());

  // If there's literally nothing to say, render nothing — let the avatar
  // sit alone rather than show a hollow indicator.
  if (!action && !hasReasoning) return null;

  return (
    <div className={cn('flex flex-col gap-1.5 justify-center min-h-7', className)}>
      {/* Row 1: shimmering action line + optional reasoning chevron */}
      <div className="flex items-center gap-1.5">
        <AnimatePresence mode="wait" initial={false}>
          {action && (
            <motion.span
              key={action}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="chippi-thinking-shimmer text-[13px] font-medium leading-relaxed"
            >
              {action}
            </motion.span>
          )}
        </AnimatePresence>

        {hasReasoning && (
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Hide reasoning' : 'Show reasoning'}
            className="inline-flex items-center justify-center w-4 h-4 rounded text-foreground/35 hover:text-foreground/65 transition-colors"
          >
            <motion.span
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="inline-flex"
            >
              <ChevronDown className="w-3 h-3" />
            </motion.span>
          </button>
        )}
      </div>

      {/* Row 2: collapsible reasoning stream */}
      <AnimatePresence initial={false}>
        {open && hasReasoning && (
          <motion.div
            key="reasoning"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p className="text-[12px] text-foreground/35 leading-relaxed max-w-prose whitespace-pre-wrap pl-0.5 pb-1">
              {streamingReasoning}
              <span className="chippi-cursor" aria-hidden="true" />
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
