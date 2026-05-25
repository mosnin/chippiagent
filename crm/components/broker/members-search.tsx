'use client';

import { useState, useMemo, ReactNode } from 'react';
import { Search, X } from 'lucide-react';

export interface MemberItem {
  id: string;
  name: string | null;
  email: string | null;
}

export function MembersSearch({
  members,
  children,
}: {
  members: MemberItem[];
  children: (visibleIds: Set<string>) => ReactNode;
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const visibleIds = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return new Set(members.map((m) => m.id));
    return new Set(
      members
        .filter(
          (m) =>
            (m.name ?? '').toLowerCase().includes(q) ||
            (m.email ?? '').toLowerCase().includes(q)
        )
        .map((m) => m.id)
    );
  }, [members, searchQuery]);

  return (
    <>
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search members…"
          className="h-8 w-56 rounded-lg border border-border bg-muted/60 pl-8 pr-7 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:bg-background transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={12} />
          </button>
        )}
      </div>
      {children(visibleIds)}
    </>
  );
}
