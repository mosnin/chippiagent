import type { Variants, Transition } from 'framer-motion';

/** Premium ease-out cubic — Apple-ish curve for entrances. */
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
export const EASE_IN_OUT: [number, number, number, number] = [0.4, 0, 0.2, 1];

export const DURATION_FAST = 0.15;
export const DURATION_BASE = 0.22;
export const DURATION_SLOW = 0.32;

/** Page-level fade + tiny y-translate. */
export const PAGE_VARIANTS: Variants = {
  initial: { opacity: 0, y: 4 },
  enter: { opacity: 1, y: 0, transition: { duration: DURATION_BASE, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DURATION_FAST } },
};

/** Stagger container — children animate in sequence. */
export const STAGGER_CONTAINER: Variants = {
  initial: { opacity: 1 },
  enter: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

/** Stagger child — fade + tiny y. Use inside STAGGER_CONTAINER. */
export const STAGGER_ITEM: Variants = {
  initial: { opacity: 0, y: 4 },
  enter: { opacity: 1, y: 0, transition: { duration: DURATION_BASE, ease: EASE_OUT } },
};

/** Hover scale for rows/cards — very subtle. */
export const HOVER_ROW: Transition = { duration: DURATION_FAST };

/** Modal/dialog content variant. */
export const DIALOG_VARIANTS: Variants = {
  initial: { opacity: 0, scale: 0.97, y: 4 },
  enter: { opacity: 1, scale: 1, y: 0, transition: { duration: DURATION_BASE, ease: EASE_OUT } },
  exit: { opacity: 0, scale: 0.97, transition: { duration: DURATION_FAST } },
};
