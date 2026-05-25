'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Loader2,
  Check,
  Building2,
  Inbox,
} from 'lucide-react';
import Link from 'next/link';
import type { SpaceFailureRow, FailedLeadRow } from './page';
import { EmptyState } from '@/components/ui/empty-state';
import { DateRangePresets } from '@/components/ui/date-range-presets';

type Stats = {
  totalContacts: number;
  totalScored: number;
  totalFailed: number;
  totalPending: number;
  failed24h: number;
  failed7d: number;
};

type RowState = 'idle' | 'loading' | 'success' | 'error';

export function ScoringHealthClient({
  stats,
  perSpace,
  failedLeads,
}: {
  stats: Stats;
  perSpace: SpaceFailureRow[];
  failedLeads: FailedLeadRow[];
}) {
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [rowMessage, setRowMessage] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [days, setDays] = useState(7);

  const scoredRate =
    stats.totalContacts > 0
      ? Math.round((stats.totalScored / stats.totalContacts) * 100)
      : 0;
  const failedRate =
    stats.totalContacts > 0
      ? Math.round((stats.totalFailed / stats.totalContacts) * 100)
      : 0;

  // Pick the matching failed count for the selected period
  const failedInPeriod = days <= 1 ? stats.failed24h : stats.failed7d;
  const periodLabel = days <= 1 ? '24h' : `${days}d`;

  async function retry(contactId: string) {
    setRowState((s) => ({ ...s, [contactId]: 'loading' }));
    setRowMessage((s) => ({ ...s, [contactId]: '' }));
    try {
      const res = await fetch('/api/admin/scoring/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        scoringStatus?: string;
        scoreLabel?: string | null;
        error?: string;
      };
      if (!res.ok || !data.success) {
        setRowState((s) => ({ ...s, [contactId]: 'error' }));
        setRowMessage((s) => ({
          ...s,
          [contactId]: data.error || `Failed (${data.scoringStatus ?? 'unknown'})`,
        }));
        return;
      }
      setRowState((s) => ({ ...s, [contactId]: 'success' }));
      setRowMessage((s) => ({
        ...s,
        [contactId]: `Rescored: ${data.scoreLabel ?? data.scoringStatus ?? 'ok'}`,
      }));
      // Fade row out after a beat
      setTimeout(() => {
        setHidden((prev) => {
          const next = new Set(prev);
          next.add(contactId);
          return next;
        });
      }, 1500);
    } catch (err) {
      setRowState((s) => ({ ...s, [contactId]: 'error' }));
      setRowMessage((s) => ({
        ...s,
        [contactId]: err instanceof Error ? err.message : 'Network error',
      }));
    }
  }

  const visibleFailed = failedLeads.filter((l) => !hidden.has(l.id));

  const metrics = [
    {
      label: 'Total contacts',
      value: stats.totalContacts,
      sub: `${scoredRate}% scored`,
      icon: Activity,
      color: 'text-blue-500',
      accent: false,
    },
    {
      label: 'Successfully scored',
      value: stats.totalScored,
      sub: `${scoredRate}% of all`,
      icon: CheckCircle2,
      color: 'text-emerald-500',
      accent: false,
    },
    {
      label: 'Failed scoring',
      value: stats.totalFailed,
      sub: `${failedRate}% of all`,
      icon: AlertTriangle,
      color: 'text-rose-500',
      accent: stats.totalFailed > 0,
    },
    {
      label: 'Pending',
      value: stats.totalPending,
      sub: 'awaiting scoring',
      icon: Clock,
      color: 'text-amber-500',
      accent: false,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Scoring Health</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor AI scoring failures and retry from a single place.
          </p>
        </div>
        <DateRangePresets value={days} onChange={setDays} />
      </div>

      {/* Top metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map(({ label, value, sub, icon: Icon, color, accent }) => (
          <Card
            key={label}
            className={`rounded-xl border bg-card h-full ${
              accent
                ? 'border-rose-300/50 bg-rose-50/30 dark:border-rose-500/20 dark:bg-rose-500/5'
                : ''
            }`}
          >
            <CardContent className="p-6 h-full flex flex-col justify-between">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <p
                    className={`text-2xl font-bold mt-0.5 tabular-nums ${
                      accent ? 'text-rose-600 dark:text-rose-400' : ''
                    }`}
                  >
                    {value}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
                </div>
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    accent ? 'bg-rose-100 dark:bg-rose-500/10' : 'bg-muted'
                  }`}
                >
                  <Icon size={15} className={accent ? 'text-rose-600 dark:text-rose-400' : color} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trend row — responds to selected period */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="rounded-xl border bg-card">
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground font-medium">
              Failed (last {periodLabel})
            </p>
            <p className="text-2xl font-bold mt-0.5 tabular-nums">{failedInPeriod}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Rolling window</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border bg-card">
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground font-medium">Failed (all time)</p>
            <p className="text-2xl font-bold mt-0.5 tabular-nums">{stats.totalFailed}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Across all contacts</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-space failures */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Top spaces by failure count
        </h2>
        {perSpace.length === 0 ? (
          <Card className="rounded-xl border bg-card">
            <EmptyState
              icon={Inbox}
              title="No failed scoring on any space."
              size="sm"
            />
          </Card>
        ) : (
          <Card className="rounded-xl border bg-card">
            <div className="divide-y divide-border">
              {perSpace.map((row) => (
                <div
                  key={row.spaceId}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <Building2 size={14} className="text-violet-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {row.spaceName || row.spaceSlug || row.spaceId}
                    </p>
                    {row.spaceSlug && (
                      <p className="text-xs text-muted-foreground truncate">/{row.spaceSlug}</p>
                    )}
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                    {row.failedCount}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Failed leads */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Recent failed leads
          </h2>
          <span className="text-xs text-muted-foreground">
            {visibleFailed.length} shown
          </span>
        </div>
        {visibleFailed.length === 0 ? (
          <Card className="rounded-xl border bg-card">
            <EmptyState
              icon={Inbox}
              title="No failed leads in view."
              size="sm"
            />
          </Card>
        ) : (
          <Card className="rounded-xl border bg-card">
            <div className="divide-y divide-border">
              {visibleFailed.map((lead) => {
                const state = rowState[lead.id] ?? 'idle';
                const msg = rowMessage[lead.id];
                return (
                  <div
                    key={lead.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">
                          {lead.name || 'Unnamed lead'}
                        </p>
                        {lead.spaceSlug && (
                          <Link
                            href={`/spaces/${lead.spaceSlug}`}
                            className="text-[10px] font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5 hover:underline"
                          >
                            {lead.spaceSlug}
                          </Link>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {lead.scoreSummary || 'No summary available'}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(lead.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                      {msg && (
                        <p
                          className={`text-[11px] mt-0.5 ${
                            state === 'success'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : state === 'error'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-muted-foreground'
                          }`}
                        >
                          {msg}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 flex-shrink-0"
                      disabled={state === 'loading' || state === 'success'}
                      onClick={() => retry(lead.id)}
                    >
                      {state === 'loading' ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : state === 'success' ? (
                        <Check size={13} className="text-emerald-500" />
                      ) : (
                        <RefreshCw size={13} />
                      )}
                      {state === 'loading'
                        ? 'Retrying'
                        : state === 'success'
                          ? 'Done'
                          : 'Retry'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
