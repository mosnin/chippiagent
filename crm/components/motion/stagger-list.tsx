'use client';

import { motion } from 'framer-motion';
import { STAGGER_CONTAINER, STAGGER_ITEM } from '@/lib/motion';
import type { ReactNode } from 'react';

interface StaggerListProps {
  children: ReactNode;
  className?: string;
  /** Override the default staggerChildren (0.04). */
  stagger?: number;
}

export function StaggerList({ children, className, stagger }: StaggerListProps) {
  const variants = stagger
    ? { ...STAGGER_CONTAINER, enter: { ...STAGGER_CONTAINER.enter as object, transition: { staggerChildren: stagger } } }
    : STAGGER_CONTAINER;
  return (
    <motion.div initial="initial" animate="enter" variants={variants} className={className}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={STAGGER_ITEM} className={className}>
      {children}
    </motion.div>
  );
}
