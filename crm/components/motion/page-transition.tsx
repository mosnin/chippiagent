'use client';

import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { PAGE_VARIANTS } from '@/lib/motion';

/**
 * Wraps page children with a fade + tiny y-translate on route change.
 * Mounts inside the workspace `<main>` so the chrome (header / sidebar)
 * doesn't re-animate on every nav.
 *
 * Accepts an optional className so callers can give the wrapper flex
 * sizing — needed on the Chippi chat route where the page must fill
 * the parent flex column for the composer's bottom-pin to work.
 * Standard pages don't pass one and the wrapper sizes to content
 * exactly like before.
 */
export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      variants={PAGE_VARIANTS}
      initial="initial"
      animate="enter"
      exit="exit"
      className={className}
    >
      {children}
    </motion.div>
  );
}
