'use client';

import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, X } from 'lucide-react';
import Link from 'next/link';
import { formatCompact } from '@/lib/formatting';

export interface RealtorRow {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  onboard: boolean;
  role: string;
  spaceSlug: string | null;
  /** Total people on file (excludes application-link tags). */
  people: number;
  /** Deal count. */
  deals: number;
  /** Sum of deal values. */
  pipeline: number;
}

type SortKey = 'name' | 'people' | 'deals' | 'pipeline';
type SortDir = 'asc' | 'desc';

function initials(name: string | null, email: string) {
  return (name || email || '?')
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

export function RealtorsClient({ realtors }: { realtors: RealtorRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('pipeline');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = q
      ? realtors.filter(
          (r) =>
            (r.name ?? '').toLowerCase().includes(q) ||
            r.email.toLowerCase().includes(q),
        )
      : realtors;

    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') {
        const va = (a.name || a.email).toLowerCase();
        const vb = (b.name || b.email).toLowerCase();
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      const va = a[sortKey] as number;
      const vb = b[sortKey] as number;
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [realtors, sortKey, sortDir, searchQuery]);

  return (
    <div className="space-y-3">
      {/* Search — the only chrome. Status filter, view toggle, sort pill row all cut. */}
      <div className="relative w-full sm:w-64">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search realtors…"
          className="h-9 w-full rounded-lg border border-border bg-muted/60 pl-8 pr-7 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:bg-background transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">
          No realtors match.
        </p>
      ) : (
        <Table rows={sorted} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
      )}
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

function Table({
  rows,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: RealtorRow[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  function Th({
    col,
    label,
    align = 'left',
  }: {
    col: SortKey;
    label: string;
    align?: 'left' | 'right';
  }) {
    const active = col === sortKey;
    return (
      <th
        className={`px-4 py-3 ${align === 'right' ? 'text-right' : 'text-left'} cursor-pointer select-none group`}
        onClick={() => onSort(col)}
      >
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider ${
            active
              ? 'text-foreground'
              : 'text-muted-foreground group-hover:text-foreground'
          }`}
        >
          {label}
          {active ? (
            sortDir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />
          ) : (
            <ArrowUpDown size={11} className="opacity-0 group-hover:opacity-40" />
          )}
        </span>
      </th>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th col="name" label="Realtor" />
              <Th col="people" label="People" align="right" />
              <Th col="deals" label="Deals" align="right" />
              <Th col="pipeline" label="Pipeline" align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.membershipId}
                className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/broker/realtors/${r.userId}`}
                    className="flex items-center gap-3 min-w-0 group"
                  >
                    <div className="relative w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                      {initials(r.name, r.email)}
                      {!r.onboard && (
                        <span
                          className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 border border-background"
                          title="Pending invite"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                        {r.name ?? r.email}
                      </p>
                      {r.name && (
                        <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                      )}
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-sm">
                  {r.people}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-sm font-medium">
                  {r.deals}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-sm">
                  {r.pipeline > 0 ? formatCompact(r.pipeline) : <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
