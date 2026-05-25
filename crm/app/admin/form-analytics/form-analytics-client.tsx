'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  FileText,
  TrendingUp,
  Star,
  AlertTriangle,
  Flame,
  Thermometer,
  Snowflake,
  BarChart3,
  Building2,
  LayoutGrid,
  Search,
  BarChart2,
  Inbox,
} from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/ui/empty-state';
import { DateRangePresets } from '@/components/ui/date-range-presets';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type {
  ScoreDistribution,
  BrokerageSubmissionRow,
  SpaceSubmissionRow,
  SourceRow,
  TrendPoint,
} from './page';

type Stats = {
  totalSubmissions: number;
  submissions7d: number;
  submissions30d: number;
  avgScore: number;
  emptyApplications: number;
};

export function FormAnalyticsClient({
  stats,
  distribution,
  topBrokerages,
  topSpaces,
  trend,
  perSource,
}: {
  stats: Stats;
  distribution: ScoreDistribution;
  topBrokerages: BrokerageSubmissionRow[];
  topSpaces: SpaceSubmissionRow[];
  trend: TrendPoint[];
  perSource: SourceRow[];
}) {
  const [filter, setFilter] = useState('');
  const [days, setDays] = useState(30);

  const filteredBrokerages = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return topBrokerages;
    return topBrokerages.filter((b) =>
      (b.brokerageName ?? b.brokerageId).toLowerCase().includes(q),
    );
  }, [filter, topBrokerages]);

  const filteredSpaces = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return topSpaces;
    return topSpaces.filter((s) =>
      ((s.spaceName ?? '') + ' ' + (s.spaceSlug ?? '') + ' ' + s.spaceId)
        .toLowerCase()
        .includes(q),
    );
  }, [filter, topSpaces]);

  const totalScored =
    distribution.hot + distribution.warm + distribution.cold + distribution.unqualified;

  const distItems = [
    {
      label: 'Hot',
      value: distribution.hot,
      icon: Flame,
      bar: 'bg-red-500',
      text: 'text-red-600 dark:text-red-400',
    },
    {
      label: 'Warm',
      value: distribution.warm,
      icon: Thermometer,
      bar: 'bg-amber-500',
      text: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Cold',
      value: distribution.cold,
      icon: Snowflake,
      bar: 'bg-blue-500',
      text: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Unqualified',
      value: distribution.unqualified,
      icon: BarChart3,
      bar: 'bg-gray-400',
      text: 'text-gray-600 dark:text-gray-400',
    },
  ];

  const metrics = [
    {
      label: 'Total submissions',
      value: stats.totalSubmissions,
      sub: `+${stats.submissions7d} last 7d`,
      icon: FileText,
      color: 'text-blue-500',
    },
    {
      label: 'Last 30 days',
      value: stats.submissions30d,
      sub: 'rolling window',
      icon: TrendingUp,
      color: 'text-emerald-500',
    },
    {
      label: 'Avg lead score',
      value: stats.avgScore || '—',
      sub: 'across scored leads',
      icon: Star,
      color: 'text-violet-500',
    },
    {
      label: 'Empty submissions',
      value: stats.emptyApplications,
      sub: 'no application data',
      icon: AlertTriangle,
      color: 'text-amber-500',
    },
  ];

  // Client-side trend filtering: slice to last N days from the full 30-day dataset
  const filteredTrend = useMemo(() => {
    if (days >= trend.length) return trend;
    return trend.slice(trend.length - days);
  }, [trend, days]);

  const trendFormatted = filteredTrend.map((d) => ({
    ...d,
    label: new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
  }));

  const trendTotal = filteredTrend.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Form Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Conversion metrics across intake forms.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <DateRangePresets value={days} onChange={setDays} />
          <div className="relative w-full sm:w-[280px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Filter brokerages or spaces…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map(({ label, value, sub, icon: Icon, color }) => (
          <Card key={label} className="rounded-xl border bg-card h-full">
            <CardContent className="p-6 h-full flex flex-col justify-between">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <p className="text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
                </div>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted">
                  <Icon size={15} className={color} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Score distribution + Source funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-xl border bg-card">
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Score distribution
            </h2>
            {totalScored === 0 ? (
              <EmptyState icon={BarChart2} title="No scored leads yet." size="sm" />
            ) : (
              <div className="space-y-4">
                {distItems.map(({ label, value, icon: Icon, bar, text }) => {
                  const pct = totalScored > 0 ? Math.round((value / totalScored) * 100) : 0;
                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <Icon size={14} className={text} />
                          <span className="text-xs font-medium">{label}</span>
                        </div>
                        <span className="text-xs font-semibold tabular-nums">
                          {value}{' '}
                          <span className="text-muted-foreground font-normal">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${bar} rounded-full transition-all duration-500`}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border bg-card">
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Submissions by source
            </h2>
            {perSource.length === 0 ? (
              <EmptyState icon={Inbox} title="No submissions tagged yet." size="sm" />
            ) : (
              <div className="space-y-3">
                {perSource.map(({ source, count }) => {
                  const max = perSource[0]?.count ?? 1;
                  const pct = Math.round((count / max) * 100);
                  return (
                    <div key={source}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">{source}</span>
                        <span className="text-xs font-semibold tabular-nums">{count}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trend */}
      <Card className="rounded-xl border bg-card">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold">Submission trend</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Last {days} days · {trendTotal} total
              </p>
            </div>
          </div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={trendFormatted}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="formAnalyticsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: 'currentColor' }}
                  interval={Math.max(Math.floor(trendFormatted.length / 6), 1)}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: 'currentColor' }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  }}
                  formatter={(value: unknown) => [`${value} submissions`, ''] as [string, string]}
                  labelFormatter={(label: unknown) => String(label)}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#formAnalyticsGradient)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: 'hsl(var(--primary))' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Top tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Top brokerages
          </h2>
          {filteredBrokerages.length === 0 ? (
            <Card className="rounded-xl border bg-card">
              <EmptyState icon={Building2} title="No brokerage submissions yet." size="sm" />
            </Card>
          ) : (
            <Card className="rounded-xl border bg-card">
              <div className="divide-y divide-border">
                {filteredBrokerages.map((b) => (
                  <Link
                    key={b.brokerageId}
                    href={`/admin/brokerages/${b.brokerageId}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <Building2 size={14} className="text-violet-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {b.brokerageName || b.brokerageId}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{b.count}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Top spaces
          </h2>
          {filteredSpaces.length === 0 ? (
            <Card className="rounded-xl border bg-card">
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground">No space submissions yet.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-xl border bg-card">
              <div className="divide-y divide-border">
                {filteredSpaces.map((s) => (
                  <Link
                    key={s.spaceId}
                    href={`/admin/spaces`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <LayoutGrid size={14} className="text-cyan-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {s.spaceName || s.spaceSlug || s.spaceId}
                      </p>
                      {s.spaceSlug && (
                        <p className="text-xs text-muted-foreground truncate">/{s.spaceSlug}</p>
                      )}
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{s.count}</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
