'use client';
import { motion } from 'motion/react';
import { CheckCircle2, Copy, Check, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { H3, BODY, BODY_MUTED } from '@/lib/typography';
import { EASE_OUT, DURATION_BASE } from '@/lib/motion';

interface SwarmOutputPanelProps {
  result: string;
  status: string;
}

export function SwarmOutputPanel({ result, status }: SwarmOutputPanelProps) {
  const [copied, setCopied] = useState(false);

  if (status === 'failed') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
        className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-6 space-y-4"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="text-rose-500 flex-shrink-0" size={18} />
          <p className={cn(H3, 'font-semibold')}>Swarm failed.</p>
        </div>
        {result && (
          <p className={cn(BODY_MUTED, 'leading-relaxed')}>{result}</p>
        )}
      </motion.div>
    );
  }

  if (status !== 'completed' || !result) return null;

  const paragraphs = result.split(/\n\n+/).filter(Boolean);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — silently ignore
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
      className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="text-emerald-500 flex-shrink-0" size={18} />
          <p className={cn(H3, 'font-semibold')}>Swarm complete.</p>
        </div>
        <button
          onClick={handleCopy}
          aria-label="Copy result"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5',
            'border border-border/60 bg-background',
            'text-xs text-muted-foreground hover:text-foreground',
            'hover:bg-foreground/[0.04] transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          )}
        >
          {copied ? (
            <>
              <Check size={12} />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Result body */}
      <div className="space-y-3">
        {paragraphs.length > 1 ? (
          paragraphs.map((para, i) => (
            <p key={i} className={cn(BODY, 'whitespace-pre-wrap leading-relaxed')}>
              {para}
            </p>
          ))
        ) : (
          <p className={cn(BODY, 'whitespace-pre-wrap leading-relaxed')}>{result}</p>
        )}
      </div>
    </motion.div>
  );
}
