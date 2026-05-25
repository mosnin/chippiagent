'use client';

/**
 * ReasoningBlockView — collapsible "Thought for Xs" trace shown above the
 * assistant's reply. Same disclosure pattern as ToolGroup so the chat reads
 * as one consistent chrome family. Body is the model's chain of thought as
 * persisted prose — quiet by default, expand for the full text.
 *
 * Only renders when the model produced reasoning (reasoning-capable models
 * with reasoning_effort enabled). Older / non-reasoning models simply don't
 * emit the block, so the row disappears entirely.
 */

import { useEffect, useState } from 'react';
import { ChevronRight, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { ReasoningBlock } from '@/lib/ai-tools/blocks';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';

function formatDuration(ms?: number): string | null {
  if (!ms || ms < 500) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

export interface ReasoningBlockViewProps {
  block: ReasoningBlock;
  /** When true, the header label keeps the shimmer on (turn still streaming). */
  streaming?: boolean;
}

export function ReasoningBlockView({ block, streaming }: ReasoningBlockViewProps) {
  const [expanded, setExpanded] = useState(false);
  // Inject the shared shimmer animation the ToolGroup primitive already
  // installs. Idempotent — both viewmodels can call it.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('an-tool-group-shimmer')) return;
    // ToolGroup mounts its own style block; if it hasn't yet, we still want
    // the class to no-op gracefully (CSS missing just removes the shimmer).
  }, []);

  const elapsed = formatDuration(block.durationMs);
  const label = streaming ? 'Thinking' : elapsed ? `Thought for ${elapsed}` : 'Thought';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
      className="w-full"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'group w-full flex items-center gap-2 h-8 text-sm text-left',
          'cursor-pointer text-neutral-700 dark:text-neutral-300',
        )}
      >
        <ChevronRight
          className={cn(
            'w-3.5 h-3.5 shrink-0 text-neutral-500 dark:text-neutral-400 transition-transform',
            expanded ? 'rotate-90' : 'rotate-0',
          )}
        />
        <MessageCircle
          className="w-3.5 h-3.5 shrink-0 text-neutral-500 dark:text-neutral-400"
          aria-hidden
        />
        <span className={cn('shrink-0', streaming && 'an-tg-shimmer')}>{label}</span>
      </button>

      {expanded && (
        <div className="pl-5 pr-2 pb-2">
          <div
            className={cn(
              'mt-1 px-3 py-2.5 rounded-md border border-border/40 bg-muted/30',
              'text-[12.5px] leading-relaxed text-foreground/80 whitespace-pre-wrap',
              'max-h-[400px] overflow-y-auto',
            )}
          >
            {block.content}
          </div>
        </div>
      )}
    </motion.div>
  );
}
