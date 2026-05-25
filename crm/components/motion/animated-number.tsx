'use client';

import { animate, useInView, useMotionValue } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  /** Format like `formatCompact` — receives the current numeric value. */
  format?: (n: number) => string;
  /** Animation duration (ms). Default 800. */
  duration?: number;
  className?: string;
}

/**
 * Count-up animation. Triggers once when the element enters the viewport;
 * subsequent value changes also animate. Honors reduced-motion via the
 * runtime check so users with the OS setting see the final value instantly.
 */
export function AnimatedNumber({ value, format, duration = 800, className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const motionValue = useMotionValue(0);
  const [display, setDisplay] = useState(format ? format(0) : '0');

  useEffect(() => {
    if (!inView) return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      motionValue.set(value);
      setDisplay(format ? format(value) : String(Math.round(value)));
      return;
    }
    const controls = animate(motionValue, value, {
      duration: duration / 1000,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(format ? format(v) : String(Math.round(v))),
    });
    return () => controls.stop();
  }, [value, inView, duration, format, motionValue]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
