'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';

type Tab = 'overview' | 'activity';

interface Props {
  /** The current `?tab=` value as parsed by the server. Anything that
   *  isn't 'activity' is treated as Overview so legacy URLs stay valid. */
  active: 'overview' | 'activity' | 'intelligence' | 'deals' | string;
  /** Builds the href for a given tab key. Lives on the server because
   *  it needs the contact id from params. */
  hrefFor: (key: Tab) => string;
}

const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'activity', label: 'Activity' },
];

/**
 * Two-tab strip with a motion.layoutId sliding underline. Same pattern
 * as the broker reviews page so the chrome reads as one product. Old
 * `?tab=intelligence` and `?tab=deals` URLs map to Overview because the
 * server-side page collapsed those views into Overview's flow.
 */
export function ContactTabStrip({ active, hrefFor }: Props) {
  return (
    <div role="tablist" aria-label="Contact view" className="flex items-center gap-0 border-b border-border/60">
      {TABS.map((t) => {
        const isActive = active === t.key || (t.key === 'overview' && active !== 'activity');
        return (
          <Link
            key={t.key}
            href={hrefFor(t.key)}
            role="tab"
            aria-selected={isActive}
            scroll={false}
            className={cn(
              'relative inline-flex items-center px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {isActive && (
              <motion.span
                layoutId="contact-tab-underline"
                className="absolute bottom-[-1px] left-2 right-2 h-[2px] rounded-full bg-foreground"
                transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
                aria-hidden
              />
            )}
          </Link>
        );
      })}
    </div>
  );
}
