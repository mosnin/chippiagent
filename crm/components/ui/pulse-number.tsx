'use client';

/**
 * PulseNumber — renders a number that pulses once whenever it changes.
 *
 * Cockpit motion rule: an instrument only moves when its reading changes.
 * Used for the sidebar badges and the approvals pill so a count ticking
 * up is something the realtor *sees*, not something they have to notice.
 * Confident easing, no bounce — matches the onboarding shell curve.
 */

import { useEffect, useRef } from 'react';
import { motion, useAnimationControls } from 'framer-motion';

export function PulseNumber({
  value,
  className,
}: {
  value: number | string;
  className?: string;
}) {
  const controls = useAnimationControls();
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      void controls.start({
        scale: [1, 1.18, 1],
        transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
      });
    }
  }, [value, controls]);

  return (
    <motion.span animate={controls} className={className} style={{ display: 'inline-block' }}>
      {value}
    </motion.span>
  );
}
