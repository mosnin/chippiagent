'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Tab = {
  label: string;
  href: string;
  /** Route prefix that should mark this tab active */
  matches: string[];
};

/**
 * Unified tab bar for the People hub — lives on top of /contacts and /leads.
 * Preserves both routes so existing bookmarks keep working; visually they're
 * one surface.
 */
export function PeopleTabs({ slug, newCount }: { slug: string; newCount?: number }) {
  const pathname = usePathname() ?? '';

  const tabs: Tab[] = [
    { label: 'New', href: `/s/${slug}/leads`, matches: [`/s/${slug}/leads`] },
    { label: 'All', href: `/s/${slug}/contacts`, matches: [`/s/${slug}/contacts`] },
  ];

  return (
    <div className="flex items-center gap-1 border-b border-border -mb-px">
      {tabs.map((tab) => {
        const isActive = tab.matches.some((m) => pathname === m || pathname.startsWith(`${m}/`));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {tab.label === 'New' && newCount && newCount > 0 ? (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-foreground">
                {newCount}
              </span>
            ) : null}
            {isActive && (
              <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-foreground" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
