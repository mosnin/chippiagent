'use client';

import { useState, useMemo, Fragment } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────

interface AuditLogEntry {
  id: string;
  clerkId: string | null;
  ipAddress: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  spaceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface UserInfo {
  name: string | null;
  email: string;
}

interface AuditLogClientProps {
  logs: AuditLogEntry[];
  userMap: Record<string, UserInfo>;
}

// ── Constants ───────────────────────────────────────────────────────────────

const ACTION_TYPES = ['CREATE', 'UPDATE', 'DELETE', 'ACCESS', 'LOGIN', 'LOGOUT', 'ADMIN_ACTION'] as const;
const RESOURCE_TYPES = [
  'Contact',
  'Deal',
  'Space',
  'Brokerage',
  'User',
  'Tour',
  'Invitation',
  'Session',
  'AdminAction',
] as const;

const ACTION_BADGE_STYLES: Record<string, string> = {
  CREATE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  ACCESS: 'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400',
  LOGIN: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
  LOGOUT: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400',
  ADMIN_ACTION: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatAbsolute(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ── Component ───────────────────────────────────────────────────────────────

export function AuditLogClient({ logs, userMap }: AuditLogClientProps) {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return logs.filter((log) => {
      // Action filter
      if (actionFilter && log.action !== actionFilter) return false;
      // Resource filter
      if (resourceFilter && log.resource !== resourceFilter) return false;
      // Search filter
      if (q) {
        const user = log.clerkId ? userMap[log.clerkId] : null;
        const haystack = [
          user?.email,
          user?.name,
          log.resourceId,
          log.action,
          log.resource,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [logs, search, actionFilter, resourceFilter, userMap]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search by email, name, or resource ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Action filter */}
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">All actions</option>
          {ACTION_TYPES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        {/* Resource filter */}
        <select
          value={resourceFilter}
          onChange={(e) => setResourceFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">All resources</option>
          {RESOURCE_TYPES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {logs.length} entries
      </p>

      {/* Table */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              No audit logs found
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {logs.length === 0
                ? 'No audit events have been recorded yet.'
                : 'Try adjusting your filters or search query.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                    Timestamp
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                    Actor
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                    Action
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                    Resource
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                    Space
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                    IP Address
                  </th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((log) => {
                  const user = log.clerkId ? userMap[log.clerkId] : null;
                  const isExpanded = expandedRow === log.id;
                  const badgeStyle =
                    ACTION_BADGE_STYLES[log.action] ??
                    'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400';

                  return (
                    <Fragment key={log.id}>
                      <tr
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() =>
                          setExpandedRow(isExpanded ? null : log.id)
                        }
                      >
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span title={formatAbsolute(log.createdAt)}>
                            {timeAgo(log.createdAt)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {user ? (
                            <div className="min-w-0">
                              {user.name && (
                                <span className="font-medium text-foreground">
                                  {user.name}
                                </span>
                              )}
                              <span
                                className={
                                  user.name
                                    ? ' text-muted-foreground text-xs ml-1.5'
                                    : 'text-foreground'
                                }
                              >
                                {user.email}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              {log.clerkId
                                ? log.clerkId.slice(0, 12) + '...'
                                : 'System'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span
                            className={`inline-flex text-[11px] font-semibold rounded-full px-2 py-0.5 ${badgeStyle}`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="font-medium">{log.resource}</span>
                          {log.resourceId && (
                            <span className="text-muted-foreground text-xs ml-1.5">
                              {log.resourceId.length > 16
                                ? log.resourceId.slice(0, 16) + '...'
                                : log.resourceId}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-xs">
                          {log.spaceId
                            ? log.spaceId.length > 16
                              ? log.spaceId.slice(0, 16) + '...'
                              : log.spaceId
                            : '-'}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-xs font-mono">
                          {log.ipAddress ?? '-'}
                        </td>
                        <td className="px-4 py-2.5">
                          {log.metadata ? (
                            isExpanded ? (
                              <ChevronDown
                                size={14}
                                className="text-muted-foreground"
                              />
                            ) : (
                              <ChevronRight
                                size={14}
                                className="text-muted-foreground"
                              />
                            )
                          ) : null}
                        </td>
                      </tr>
                      {isExpanded && log.metadata && (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-4 py-3 bg-muted/20"
                          >
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">
                              Metadata
                            </p>
                            <pre className="text-xs font-mono text-foreground bg-muted/40 rounded-lg p-3 overflow-x-auto max-h-64">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

