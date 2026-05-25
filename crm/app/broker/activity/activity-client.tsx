'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ActivityRow {
  id: string;
  clerkId: string | null;
  ipAddress: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  spaceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { name: string | null; email: string | null } | null;
  space: { slug: string | null } | null;
}

type ActionFilter =
  | 'all'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'ACCESS'
  | 'LOGIN'
  | 'LOGOUT'
  | 'ADMIN_ACTION'
  | 'OFFBOARD';

type Window = '7' | '30' | '90' | 'all';

interface Props {
  initialRows: ActivityRow[];
  initialCursor: string | null;
  actors: Record<string, { name: string | null; email: string | null }>;
  spaceMap: Record<string, { slug: string | null }>;
  role: string;
}

interface ApiResponse {
  rows: ActivityRow[];
  nextCursor: string | null;
  actors: Record<string, { name: string | null; email: string | null }>;
  spaces: Record<string, { slug: string | null }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Relative time via Intl.RelativeTimeFormat; falls back to a compact absolute
// form once we're past a week. Same shape as reviews-client/templates-client
// so keep them aligned if you change this.
const REL_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const sevenDays = 7 * 86400;
  if (abs > sevenDays) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, secs] of REL_UNITS) {
    if (abs >= secs || unit === 'second') {
      return rtf.format(Math.round(diffSec / secs), unit);
    }
  }
  return rtf.format(diffSec, 'second');
}

// Action badge palette. Tuned to match existing broker pages — muted greys for
// read/auth events, saturated for mutating operations.
const ACTION_BADGE: Record<string, string> = {
  CREATE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  UPDATE: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  DELETE: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
  OFFBOARD: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  ADMIN_ACTION: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
  ACCESS: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
  LOGIN: 'bg-muted text-muted-foreground',
  LOGOUT: 'bg-muted text-muted-foreground',
};

function actionBadgeClass(action: string): string {
  return ACTION_BADGE[action] ?? 'bg-muted text-muted-foreground';
}

function shortenId(id: string | null): string {
  if (!id) return '';
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function actorLabel(row: ActivityRow): string {
  if (!row.clerkId) return 'System';
  const a = row.actor;
  if (a?.name && a.name.trim()) return a.name;
  if (a?.email && a.email.trim()) return a.email;
  return 'Unknown';
}

// ── Component ────────────────────────────────────────────────────────────────

export function ActivityClient({ initialRows, initialCursor, actors, spaceMap, role }: Props) {
  // `role` is forwarded for future role-gated affordances (e.g. IP column
  // visibility). Mark as read to satisfy no-unused-vars without widening prop
  // shape — same convention reviews-client uses.
  void role;

  const [rows, setRows] = useState<ActivityRow[]>(initialRows);
  const [actorIndex, setActorIndex] = useState(actors);
  const [spaceIndex, setSpaceIndex] = useState(spaceMap);
  const [cursor, setCursor] = useState<string | null>(initialCursor);

  const [action, setAction] = useState<ActionFilter>('all');
  const [win, setWin] = useState<Window>('90');
  const [search, setSearch] = useState('');

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // The server already delivered the first page matching our defaults
  // (action='all', win='90'). Skip the effect's fetch the very first time it
  // runs so we don't immediately re-request what we already have.
  const firstRun = useRef(true);

  const buildQuery = useCallback(
    (extraCursor?: string | null) => {
      const qs = new URLSearchParams();
      if (action !== 'all') qs.set('action', action);
      if (win !== 'all') {
        const days = Number(win);
        const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
        qs.set('since', since);
      }
      qs.set('limit', '100');
      if (extraCursor) qs.set('cursor', extraCursor);
      return qs.toString();
    },
    [action, win],
  );

  // Refetch from scratch whenever the action or window changes — except on the
  // very first render, where the server-fetched page already matches defaults.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/broker/activity?${buildQuery()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load activity (${res.status})`);
        const data = (await res.json()) as ApiResponse;
        if (cancelled) return;
        setRows(data.rows);
        setActorIndex((prev) => ({ ...prev, ...data.actors }));
        setSpaceIndex((prev) => ({ ...prev, ...data.spaces }));
        setCursor(data.nextCursor);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load activity';
        setLoadError(msg);
        toast.error(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // buildQuery is derived from action+win; listing both covers the change
    // set without re-running on unrelated state updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, win]);

  const handleLoadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/broker/activity?${buildQuery(cursor)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Failed to load more (${res.status})`);
      const data = (await res.json()) as ApiResponse;
      setRows((prev) => [...prev, ...data.rows]);
      setActorIndex((prev) => ({ ...prev, ...data.actors }));
      setSpaceIndex((prev) => ({ ...prev, ...data.spaces }));
      setCursor(data.nextCursor);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, buildQuery]);

  const retry = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/broker/activity?${buildQuery()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load activity (${res.status})`);
      const data = (await res.json()) as ApiResponse;
      setRows(data.rows);
      setActorIndex((prev) => ({ ...prev, ...data.actors }));
      setSpaceIndex((prev) => ({ ...prev, ...data.spaces }));
      setCursor(data.nextCursor);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load activity';
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  // Fill in actor/space from our local indexes — in case an older row came
  // from a refetch and the server didn't pre-resolve it (defensive, shouldn't
  // happen with the current route).
  const enrichedRows = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        actor: r.actor ?? (r.clerkId ? actorIndex[r.clerkId] ?? null : null),
        space: r.space ?? (r.spaceId ? spaceIndex[r.spaceId] ?? null : null),
      })),
    [rows, actorIndex, spaceIndex],
  );

  // Client-side actor search — matches name or email case-insensitively. Kept
  // client-side on purpose: keeps the backend filter surface simple and
  // ensures search is instant once a page is loaded.
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enrichedRows;
    return enrichedRows.filter((r) => {
      const n = r.actor?.name?.toLowerCase() ?? '';
      const e = r.actor?.email?.toLowerCase() ?? '';
      if (!r.clerkId && 'system'.includes(q)) return true;
      return n.includes(q) || e.includes(q);
    });
  }, [enrichedRows, search]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Filter strip ────────────────────────────────────────────────────────
  const winOptions: Array<{ key: Window; label: string }> = [
    { key: '7', label: 'Last 7 days' },
    { key: '30', label: 'Last 30 days' },
    { key: '90', label: 'Last 90 days' },
    { key: 'all', label: 'All time' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={action} onValueChange={(v) => setAction(v as ActionFilter)}>
          <SelectTrigger className="w-[180px]" aria-label="Filter by action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="CREATE">Create</SelectItem>
            <SelectItem value="UPDATE">Update</SelectItem>
            <SelectItem value="DELETE">Delete</SelectItem>
            <SelectItem value="ACCESS">Access</SelectItem>
            <SelectItem value="OFFBOARD">Offboard</SelectItem>
            <SelectItem value="ADMIN_ACTION">Admin action</SelectItem>
            <SelectItem value="LOGIN">Login</SelectItem>
            <SelectItem value="LOGOUT">Logout</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 bg-muted/60 rounded-md p-0.5">
          {winOptions.map((w) => (
            <button
              key={w.key}
              onClick={() => setWin(w.key)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                win === w.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            placeholder="Search actor by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : loadError ? (
        <LoadErrorState message={loadError} onRetry={retry} />
      ) : visibleRows.length === 0 ? (
        <EmptyState
          hasSearch={search.trim().length > 0}
          windowLabel={winOptions.find((o) => o.key === win)?.label ?? 'this range'}
        />
      ) : (
        <>
          <div className="space-y-1.5">
            {visibleRows.map((r) => {
              const isOpen = expanded.has(r.id);
              const shortRes = shortenId(r.resourceId);
              const spaceSlug = r.space?.slug ?? null;
              return (
                <Card key={r.id}>
                  <CardContent className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(r.id)}
                      className="w-full text-left flex items-center gap-3 min-w-0"
                      aria-expanded={isOpen}
                    >
                      <span className="text-muted-foreground/70 shrink-0">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                      <span className="text-xs text-muted-foreground w-24 shrink-0 tabular-nums">
                        {formatRelative(r.createdAt)}
                      </span>
                      <Badge
                        variant="secondary"
                        className={`shrink-0 font-mono text-[10px] ${actionBadgeClass(r.action)}`}
                      >
                        {r.action}
                      </Badge>
                      <span className="text-sm font-medium truncate shrink-0 max-w-[180px]">
                        {actorLabel(r)}
                      </span>
                      <span className="text-muted-foreground text-xs shrink-0">·</span>
                      <span className="text-sm text-muted-foreground truncate min-w-0">
                        {r.resource}
                        {shortRes && (
                          <span className="font-mono text-xs text-muted-foreground/70">
                            {' / '}
                            {shortRes}
                          </span>
                        )}
                      </span>
                      {spaceSlug ? (
                        <span className="ml-auto text-[11px] text-muted-foreground/80 font-mono shrink-0">
                          {spaceSlug}
                        </span>
                      ) : r.spaceId === null ? (
                        <span className="ml-auto text-[11px] text-muted-foreground/70 shrink-0 italic">
                          brokerage-wide
                        </span>
                      ) : null}
                    </button>
                    {isOpen && (
                      <div className="mt-3 pt-3 border-t border-border space-y-2">
                        <div className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1 text-xs">
                          <span className="text-muted-foreground">Timestamp</span>
                          <span className="font-mono">
                            {new Date(r.createdAt).toISOString()}
                          </span>
                          <span className="text-muted-foreground">Actor clerkId</span>
                          <span className="font-mono truncate">{r.clerkId ?? '—'}</span>
                          <span className="text-muted-foreground">IP</span>
                          <span className="font-mono">{r.ipAddress ?? '—'}</span>
                          <span className="text-muted-foreground">Resource</span>
                          <span className="font-mono truncate">
                            {r.resource}
                            {r.resourceId ? ` / ${r.resourceId}` : ''}
                          </span>
                          <span className="text-muted-foreground">Space</span>
                          <span className="font-mono truncate">
                            {r.spaceId
                              ? `${r.space?.slug ?? '(no slug)'} · ${r.spaceId}`
                              : '— (brokerage-wide)'}
                          </span>
                        </div>
                        {r.metadata && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Metadata</p>
                            <pre className="text-[11px] font-mono bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                              {JSON.stringify(r.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {cursor && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-1.5" aria-busy>
      {[0, 1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardContent className="px-4 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-3 w-3 rounded-sm" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-14 rounded-full" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function LoadErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="px-5 py-12 text-center space-y-3">
        <p className="text-sm font-medium text-foreground">Couldn&apos;t load activity</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState({ hasSearch, windowLabel }: { hasSearch: boolean; windowLabel: string }) {
  // Audit-driven copy: tell the broker they're searching a scoped window,
  // not the whole history. Missing that context made "no matches" misread
  // as "this actor has never done anything".
  return (
    <Card>
      <CardContent className="px-5 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          {hasSearch
            ? `No activity matches that search in "${windowLabel}". Try a different name or widen the date range.`
            : `Nothing logged in "${windowLabel}". Try widening the date range.`}
        </p>
      </CardContent>
    </Card>
  );
}
