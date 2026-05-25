'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, Info, ChevronRight } from 'lucide-react';
import type { LeadScoreDetails } from '@/lib/types';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';

interface Props {
  details: LeadScoreDetails | null | undefined;
}

/**
 * Expander for the score taxonomy. Native `<details>` snaps open; the rest
 * of the app uses framer-motion for content reveals (chat thinking
 * indicator, StaggerList, AnimatePresence in reviews). This wraps the same
 * content in a useState + AnimatePresence so the motion vocabulary stays
 * consistent across surfaces.
 */
export function WhyThisScore({ details }: Props) {
  const [open, setOpen] = useState(false);

  const hasContent = Boolean(
    details?.strengths?.length ||
    details?.weaknesses?.length ||
    (details?.riskFlags?.length && details.riskFlags[0] !== 'none') ||
    details?.missingInformation?.length ||
    details?.explanationTags?.length,
  );

  if (!hasContent) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5 select-none"
      >
        <span>Why this score?</span>
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
          className="text-muted-foreground/60 inline-flex"
          aria-hidden
        >
          <ChevronRight size={12} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="taxonomy"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: 'auto',
              opacity: 1,
              transition: { duration: DURATION_BASE, ease: EASE_OUT },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: { duration: DURATION_BASE, ease: EASE_OUT },
            }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-3 text-xs">
              {details?.explanationTags && details.explanationTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {details.explanationTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center text-xs rounded-full px-2 py-0.5 bg-muted text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {details?.strengths && details.strengths.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 mb-1.5 inline-flex items-center gap-1.5">
                    <CheckCircle2 size={11} /> Strengths
                  </p>
                  <ul className="space-y-1 ml-4 list-disc text-muted-foreground leading-relaxed marker:text-emerald-500/70">
                    {details.strengths.map((s) => <li key={s}>{s}</li>)}
                  </ul>
                </div>
              )}
              {details?.weaknesses && details.weaknesses.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 mb-1.5 inline-flex items-center gap-1.5">
                    <XCircle size={11} /> Weaknesses
                  </p>
                  <ul className="space-y-1 ml-4 list-disc text-muted-foreground leading-relaxed marker:text-amber-500/70">
                    {details.weaknesses.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                </div>
              )}
              {details?.riskFlags && details.riskFlags.length > 0 && details.riskFlags[0] !== 'none' && (
                <div>
                  <p className="text-[11px] font-medium text-destructive mb-1.5 inline-flex items-center gap-1.5">
                    <AlertTriangle size={11} /> Risk flags
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {details.riskFlags.map((flag) => (
                      <span
                        key={flag}
                        className="inline-flex items-center text-xs rounded-full px-2 py-0.5 bg-destructive/10 text-destructive"
                      >
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {details?.missingInformation && details.missingInformation.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground mb-1.5 inline-flex items-center gap-1.5">
                    <Info size={11} /> Missing information
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {details.missingInformation.map((item) => (
                      <span
                        key={item}
                        className="inline-flex items-center text-xs rounded-full px-2 py-0.5 bg-muted text-muted-foreground"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
