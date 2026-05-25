'use client';

import { motion } from 'motion/react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_OUT, DURATION_BASE } from '@/lib/motion';

export interface IntakeChatSuccessProps {
  businessName: string;
  agentPhoto?: string | null;
  applicationRef?: string | null;
  thankYouTitle?: string | null;
  thankYouMessage?: string | null;
  accentColor?: string;
}

export function IntakeChatSuccess({
  businessName,
  applicationRef,
  thankYouTitle,
  thankYouMessage,
}: IntakeChatSuccessProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
      className={cn(
        'flex flex-col items-center text-center',
        'px-6 py-10 space-y-5',
        'my-auto',
      )}
    >
      {/* Animated checkmark */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.18, type: 'spring', stiffness: 200, damping: 15 }}
        className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center"
        aria-hidden="true"
      >
        <CheckCircle2 size={28} className="text-emerald-600 dark:text-emerald-400" />
      </motion.div>

      {/* Headline + subtext */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28, duration: DURATION_BASE, ease: EASE_OUT }}
        className="space-y-1.5"
      >
        <h2
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          {thankYouTitle || 'Application received.'}
        </h2>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          {thankYouMessage || `Thanks for applying. ${businessName} will be in touch shortly.`}
        </p>
      </motion.div>

      {/* Application ref */}
      {applicationRef && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: DURATION_BASE }}
          className="text-[11px] tabular-nums text-muted-foreground"
        >
          Your reference: {applicationRef}
        </motion.p>
      )}
    </motion.div>
  );
}
