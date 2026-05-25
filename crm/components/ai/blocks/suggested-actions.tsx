'use client';

/**
 * SuggestedActions — 2-4 chip row that follows the last assistant message.
 * Click a chip → it fires that exact text as the realtor's next message.
 * Removes the typing step for the most-likely follow-up. Visible only when
 * the conversation is idle (not streaming) and the last turn was a
 * non-error assistant turn.
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';

export interface SuggestedActionsProps {
  suggestions: string[];
  onSelect: (text: string) => void;
  className?: string;
}

export function SuggestedActions({ suggestions, onSelect, className }: SuggestedActionsProps) {
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT, delay: 0.1 }}
      className={cn('flex flex-wrap gap-2 pl-10 pr-2', className)}
      aria-label="Suggested next actions"
    >
      {suggestions.map((text, i) => (
        <motion.button
          key={`${i}-${text}`}
          type="button"
          onClick={() => onSelect(text)}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION_BASE, ease: EASE_OUT, delay: 0.12 + i * 0.04 }}
          className={cn(
            'inline-flex items-center text-[12.5px] rounded-full',
            'border border-border/70 bg-card hover:bg-muted/40 hover:border-border',
            'px-3 py-1.5 text-foreground/85 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20',
            'active:scale-[0.98]',
          )}
        >
          {text}
        </motion.button>
      ))}
    </motion.div>
  );
}
