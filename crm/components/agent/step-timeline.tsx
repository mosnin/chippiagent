'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wrench, MessageCircle, Circle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_OUT, DURATION_BASE } from '@/lib/motion';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Step {
  id: string;
  stepType: string;
  toolName?: string;
  inputSummary?: string;
  outputSummary?: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  costUsd?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDuration(startedAt?: string, completedAt?: string): string | null {
  if (!startedAt || !completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (isNaN(ms) || ms < 0) return null;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function truncate(str: string | undefined, max: number): string {
  if (!str) return '';
  return str.length <= max ? str : `${str.slice(0, max)}…`;
}

function StepIcon({ stepType }: { stepType: string }) {
  if (stepType === 'tool_call') return <Wrench size={13} />;
  if (stepType === 'llm_call') return <MessageCircle size={13} />;
  return <Circle size={13} />;
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'flex-shrink-0 w-2 h-2 rounded-full',
        status === 'running' && 'bg-blue-500 animate-pulse',
        status === 'completed' && 'bg-green-500',
        status === 'failed' && 'bg-red-500',
        status === 'queued' && 'bg-muted-foreground/40',
        !['running', 'completed', 'failed', 'queued'].includes(status) &&
          'bg-muted-foreground/40',
      )}
    />
  );
}

// ─── Step row ─────────────────────────────────────────────────────────────────

function StepRow({ step }: { step: Step }) {
  const [expanded, setExpanded] = useState(false);
  const duration = getDuration(step.startedAt, step.completedAt);
  const label = step.toolName ?? step.stepType;
  const inputPreview = truncate(step.inputSummary, 80);

  return (
    <div
      className="group cursor-pointer rounded-lg border border-border/50 bg-background hover:bg-muted/30 transition-colors"
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Main row */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {/* Status dot */}
        <StatusDot status={step.status} />

        {/* Icon */}
        <span className="flex-shrink-0 text-muted-foreground">
          <StepIcon stepType={step.stepType} />
        </span>

        {/* Label + input summary */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-none truncate">{label}</p>
          {inputPreview && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{inputPreview}</p>
          )}
        </div>

        {/* Duration + cost + expand toggle */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {duration && (
            <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {duration}
            </span>
          )}
          {step.costUsd != null && step.costUsd > 0 && (
            <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">
              ${step.costUsd.toFixed(4)}
            </span>
          )}
          <span className="text-muted-foreground/60">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </span>
        </div>
      </div>

      {/* Expanded detail */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0 space-y-2 border-t border-border/40">
              {step.inputSummary && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
                    Input
                  </p>
                  <p className="text-xs text-foreground/80 font-mono whitespace-pre-wrap break-all">
                    {step.inputSummary}
                  </p>
                </div>
              )}
              {step.outputSummary && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
                    Output
                  </p>
                  <p className="text-xs text-foreground/80 font-mono whitespace-pre-wrap break-all">
                    {step.outputSummary}
                  </p>
                </div>
              )}
              {!step.inputSummary && !step.outputSummary && (
                <p className="text-xs text-muted-foreground italic">No details available.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Container variants ───────────────────────────────────────────────────────

const LIST_VARIANTS = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06 },
  },
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION_BASE, ease: EASE_OUT },
  },
};

// ─── Export ───────────────────────────────────────────────────────────────────

export function StepTimeline({ steps }: { steps: Step[] }) {
  if (steps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">No steps recorded yet.</p>
    );
  }

  return (
    <motion.div
      className="space-y-1.5"
      variants={LIST_VARIANTS}
      initial="hidden"
      animate="visible"
    >
      {steps.map((step) => (
        <motion.div key={step.id} variants={ITEM_VARIANTS}>
          <StepRow step={step} />
        </motion.div>
      ))}
    </motion.div>
  );
}
