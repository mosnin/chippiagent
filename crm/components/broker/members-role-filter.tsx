'use client';

import { useState, useMemo, ReactNode } from 'react';
import { Search, X } from 'lucide-react';

export interface MemberItem {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
}

type RoleTab = 'all' | 'broker_owner' | 'broker_admin' | 'realtor_member';

export function MembersRoleFilter({
  members,
  children,
}: {
  members: MemberItem[];
  children: (visibleIds: Set<string>) => ReactNode;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<RoleTab>('all');

  const counts = useMemo(() => {
    const ownerCount = members.filter((m) => m.role === 'broker_owner').length;
    const adminCount = members.filter((m) => m.role === 'broker_admin').length;
    const memberCount = members.filter((m) => m.role === 'realtor_member').length;
    return { all: members.length, broker_owner: ownerCount, broker_admin: adminCount, realtor_member: memberCount };
  }, [members]);

  const visibleIds = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return new Set(
      members
        .filter((m) => {
          if (activeTab === 'broker_admin' && m.role !== 'broker_admin' && m.role !== 'broker_owner') return false;
          if (activeTab !== 'all' && activeTab !== 'broker_admin' && m.role !== activeTab) return false;
          if (q) {
            return (
              (m.name ?? '').toLowerCase().includes(q) ||
              (m.email ?? '').toLowerCase().includes(q)
            );
          }
          return true;
        })
        .map((m) => m.id)
    );
  }, [members, searchQuery, activeTab]);

  const tabs: { key: RoleTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'broker_admin', label: 'Admins', count: counts.broker_admin + counts.broker_owner },
    { key: 'realtor_member', label: 'Members', count: counts.realtor_member },
  ];

  return (
    <>
      {/* Role filter tabs */}
      <div className="flex items-center gap-1 border-b border-border pb-0 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative px-3 py-2 text-sm font-medium transition-colors rounded-t-md ${
              activeTab === tab.key
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            <span
              className={`ml-1.5 inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums ${
                activeTab === tab.key
                  ? 'bg-primary/15 text-primary'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {tab.count}
            </span>
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search members..."
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
