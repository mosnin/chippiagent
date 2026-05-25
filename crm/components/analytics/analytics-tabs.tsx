'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Tab {
  href: string;
  label: string;
  matchPath: string;
}

/**
 * Analytics tab strip — underline pattern, paper-flat.
 * Active tab gets a foreground bottom border; idle tabs are muted.
 */
export function AnalyticsTabs({ slug }: { slug: string }) {
  const pathname = usePathname() || '';

  const tabs: Tab[] = [
    { href: '/analytics', label: 'Overview', matchPath: '/analytics' },
    { href: '/analytics/leads', label: 'Leads', matchPath: '/analytics/leads' },
    { href: '/analytics/clients', label: 'Clients', matchPath: '/analytics/clients' },
    { href: '/analytics/tours', label: 'Tours', matchPath: '/analytics/tours' },
    { href: '/analytics/pipeline', label: 'Pipeline', matchPath: '/analytics/pipeline' },
    { href: '/analytics/form-traffic', label: 'Form traffic', matchPath: '/analytics/form-traffic' },
  ];

  // Match the deepest tab that is a prefix of the current path. /analytics is
  // exact-only so it doesn't shadow /analytics/leads etc.
  const activeHref = (() => {
    let best: Tab | null = null;
    for (const tab of tabs) {
      const expected = `/s/${slug}${tab.matchPath}`;
      if (tab.matchPath === '/analytics') {
        if (pathname === expected) return tab.href;
      } else if (pathname.startsWith(expected)) {
        if (!best || tab.matchPath.length > best.matchPath.length) best = tab;
      }
    }
    return best?.href ?? null;
  })();

  return (
    <nav
      className="flex items-center gap-1 border-b border-border/60 -mx-2 px-2 overflow-x-auto"
      aria-label="Analytics sections"
    >
      {tabs.map((tab) => {
        const isActive = activeHref === tab.href;
        return (
          <Link
            key={tab.href}
            href={`/s/${slug}${tab.href}`}
            className={`flex items-center px-3 py-2 -mb-px text-sm whitespace-nowrap border-b-2 transition-colors duration-150 ${
              isActive
                ? 'border-foreground text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
