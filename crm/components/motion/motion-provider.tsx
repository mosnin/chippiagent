'use client';

import { MotionConfig } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Global motion provider — every framer-motion animation in the tree
 * honors the user's OS-level `prefers-reduced-motion: reduce` setting.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
