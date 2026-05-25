'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_IN_OUT } from '@/lib/motion';

interface EntityCardProps {
  /** The compact row always shown. Receives isExpanded so it can flip the chevron. */
  row: (isExpanded: boolean) => React.ReactNode;
  /** The expanded detail panel. Only rendered when open. */
  detail: React.ReactNode;
  /** Called when the card is first opened — use to trigger data fetch. */
  onExpand?: () => void;
  className?: string;
}

export function EntityCard({ row, detail, onExpand, className }: EntityCardProps) {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    if (!open) onExpand?.();
    setOpen(v => !v);
  };

  return (
    <div
      className={cn(
        'rounded-xl border border-border/60 bg-background overflow-hidden cursor-pointer',
        open && 'border-border',
        className
      )}
    >
      {/* Row — always visible */}
      <div onClick={toggle}>
        {row(open)}
      </div>

      {/* Detail — framer-motion height animation */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DURATION_BASE, ease: EASE_IN_OUT }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/40 bg-muted/20 px-4 py-4">
              {detail}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
