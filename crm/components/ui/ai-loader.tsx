'use client';

import { cn } from '@/lib/utils';

interface AILoaderProps {
  /** Word the letters spell while the rotating gradient turns. */
  word?: string;
  /** Override the wrapper size if the default 8rem doesn't fit the surface. */
  className?: string;
}

/**
 * Chippi AI loader — letters fade in sequence + a warm-orange gradient ring
 * rotates behind them. Used while the agent is connecting / generating.
 *
 * Honors `prefers-reduced-motion` via globals.css fallbacks.
 */
export function AILoader({ word = 'Generating', className }: AILoaderProps) {
  return (
    <div
      className={cn('ai-loader-wrapper', className)}
      role="status"
      aria-label={`${word}…`}
    >
      {word.split('').map((ch, i) => (
        <span key={`${ch}-${i}`} className="ai-loader-letter">
          {ch}
        </span>
      ))}
      <div className="ai-loader" aria-hidden />
    </div>
  );
}
