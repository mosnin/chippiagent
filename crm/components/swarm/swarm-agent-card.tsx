'use client';

import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, Loader2, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { CAPTION, BODY_MUTED } from '@/lib/typography';
import { EASE_OUT, DURATION_BASE, DURATION_FAST } from '@/lib/motion';
import type { MemberStatus } from '@/lib/swarm-types';

interface SwarmAgentCardProps {
  name: string;
  role: string | null;
  task: string;
  status: MemberStatus;
  output: string | null;
  thinkingMessage?: string | null;
  animationDelay?: number;
}

function StatusIcon({ status }: { status: MemberStatus }) {
  switch (status) {
    case 'queued':
      return <Clock className="size-4 text-muted-foreground" />;
    case 'running':
      return <Loader2 className="size-4 animate-spin text-blue-500" />;
    case 'completed':
      return <CheckCircle2 className="size-4 text-emerald-500" />;
    case 'failed':
      return <XCircle className="size-4 text-destructive" />;
  }
}

export function SwarmAgentCard({
  name,
  role,
  task,
  status,
  output,
  thinkingMessage,
  animationDelay = 0,
}: SwarmAgentCardProps) {
  const [outputOpen, setOutputOpen] = useState(false);
  const [flashGreen, setFlashGreen] = useState(false);
  const prevStatusRef = useRef<MemberStatus>(status);

  // Flash green border on completion transition
  useEffect(() => {
    if (prevStatusRef.current !== 'completed' && status === 'completed') {
      setFlashGreen(true);
      const timer = setTimeout(() => setFlashGreen(false), 800);
      return () => clearTimeout(timer);
    }
    prevStatusRef.current = status;
  }, [status]);

  const borderClass = cn(
    'rounded-xl border bg-card p-4 flex flex-col gap-3 transition-colors duration-300',
    flashGreen
      ? 'border-emerald-500/50'
      : status === 'running'
        ? 'border-blue-500/30'
        : 'border-border/60',
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: DURATION_BASE,
        ease: EASE_OUT,
        delay: animationDelay,
      }}
      className={borderClass}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-semibold text-foreground truncate">{name}</span>
          {role && (
            <span className={cn(CAPTION, 'truncate')}>{role}</span>
          )}
        </div>
        <div className="flex-shrink-0 mt-0.5">
          <StatusIcon status={status} />
        </div>
      </div>

      {/* Task */}
      <p className={cn(BODY_MUTED, 'line-clamp-2 leading-snug')}>{task}</p>

      {/* Thinking message — only when running and present */}
      <AnimatePresence>
        {status === 'running' && thinkingMessage && (
          <motion.div
            key="thinking"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2">
              {/* Pulsing dot */}
              <span className="relative flex size-1.5 flex-shrink-0">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-blue-500" />
              </span>
              <p className={cn(CAPTION, 'italic leading-snug')}>{thinkingMessage}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Output — collapsible, only when completed and output exists */}
      <AnimatePresence>
        {status === 'completed' && output && (
          <motion.div
            key="output-section"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DURATION_FAST }}
            className="flex flex-col gap-2"
          >
            <button
              type="button"
              onClick={() => setOutputOpen((prev) => !prev)}
              className={cn(
                'inline-flex items-center gap-1 self-start',
                CAPTION,
                'text-muted-foreground hover:text-foreground transition-colors duration-150',
              )}
            >
              {outputOpen ? (
                <>
                  <ChevronUp className="size-3" />
                  Hide output
                </>
              ) : (
                <>
                  <ChevronDown className="size-3" />
                  View output
                </>
              )}
            </button>

            <AnimatePresence>
              {outputOpen && (
                <motion.div
                  key="output-content"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
                  className="overflow-hidden"
                >
                  <div className="bg-muted/30 rounded-lg p-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
                    {output}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
