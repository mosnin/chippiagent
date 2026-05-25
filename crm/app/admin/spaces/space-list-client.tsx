'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Search, X, Building } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';

type SpaceRow = {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  ownerId: string;
  brokerageId: string | null;
  createdAt: string;
  stripeSubscriptionStatus: string;
  stripePeriodEnd: string | null;
};

type OwnerInfo = {
  id: string;
  name: string | null;
  email: string;
};

const statusFilters = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'trialing', label: 'Trialing' },
  { value: 'past_due', label: 'Past due' },
  { value: 'canceled', label: 'Canceled' },
  { value: 'inactive', label: 'Inactive' },
] as const;

const statusColors: Record<string, string> = {
  active:
    'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15',
  trialing:
    'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/15',
  past_due:
    'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
  canceled:
    'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/15',
  inactive:
    'text-gray-700 bg-gray-100 dark:text-gray-400 dark:bg-gray-500/15',
  unpaid:
    'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/15',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex text-[10px] font-semibold rounded-full px-2 py-0.5 capitalize',
        statusColors[status] ?? statusColors.inactive
      )}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

export function SpaceListClient({
  spaces,
  ownerMap,
  totalCount,
}: {
  spaces: SpaceRow[];
  ownerMap: Record<string, OwnerInfo>;
  totalCount: number;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => {
    let result = spaces;

    if (statusFilter !== 'all') {
      result = result.filter(
        (s) => s.stripeSubscriptionStatus === statusFilter
      );
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((s) => {
        const owner = ownerMap[s.ownerId];
        return (
          s.name.toLowerCase().includes(q) ||
          s.slug.toLowerCase().includes(q) ||
          owner?.email?.toLowerCase().includes(q) ||
          owner?.name?.toLowerCase().includes(q)
        );
      });
    }

    return result;
  }, [spaces, ownerMap, search, statusFilter]);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, slug, or owner email..."
            className="pl-9 pr-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {statusFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={cn(
              'text-xs font-medium px-3 py-1.5 rounded-full border transition-colors',
              statusFilter === f.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:bg-muted'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Result count */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground border-b border-border pb-3">
        <span>
          <strong className="text-foreground font-semibold">
            {filtered.length}
          </strong>{' '}
          of {totalCount} {totalCount === 1 ? 'space' : 'spaces'}
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building}
            title="No spaces found"
            description={
              search
                ? 'Try a different search term.'
                : 'No spaces match the current filter.'
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Name / Slug</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Subscription</th>
                  <th className="px-4 py-3 font-medium">Period End</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((space) => {
                  const owner = ownerMap[space.ownerId];
                  const createdAt = new Date(
                    space.createdAt
                  ).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });
                  const periodEnd = space.stripePeriodEnd
                    ? new Date(
                        space.stripePeriodEnd
                      ).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '--';

                  return (
                    <tr
                      key={space.id}
                      className="hover:bg-muted/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/users/${space.ownerId}`}
                          className="hover:underline"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-base flex-shrink-0">
                              {space.emoji}
                            </span>
                            <div className="min-w-0">
                              <p className="font-semibold truncate">
                                {space.name}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {space.slug}
                              </p>
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {owner ? (
                          <Link
                            href={`/admin/users/${space.ownerId}`}
                            className="hover:underline"
                          >
                            <p className="font-medium truncate max-w-[180px]">
                              {owner.name || 'No name'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                              {owner.email}
                            </p>
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Unknown
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={space.stripeSubscriptionStatus}
                        />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {periodEnd}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {createdAt}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
