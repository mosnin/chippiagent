'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { RealtorStats } from './page';
import { Trophy, Zap, Flame, Medal } from 'lucide-react';

type SortMetric = 'dealsClosed' | 'pipelineValue' | 'totalLeads' | 'conversionRate';
type TimePeriod = 'week' | 'month' | 'all';

const metricLabels: Record<SortMetric, string> = {
  dealsClosed: 'Deals',
  pipelineValue: 'Pipeline Value',
  totalLeads: 'Leads',
  conversionRate: 'Conversion Rate',
};

const timePeriodLabels: Record<TimePeriod, string> = {
  week: 'This Week',
  month: 'This Month',
  all: 'All Time',
};

function formatValue(metric: SortMetric, value: number): string {
  if (metric === 'pipelineValue') {
    return value >= 1000
      ? `$${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
      : `$${value.toLocaleString()}`;
  }
  if (metric === 'conversionRate') return `${value}%`;
  return value.toLocaleString();
}

function getCurrentMonthYear(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getCurrentTime(): string {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function BadgeChip({ badge }: { badge: string }) {
  const config: Record<string, { icon: typeof Trophy; color: string }> = {
    'Top Closer': { icon: Trophy, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
    'Fast Responder': { icon: Zap, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
    'Hot Streak': { icon: Flame, color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  };
  const c = config[badge] ?? { icon: Medal, color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' };
  const Icon = c.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold', c.color)}>
      <Icon size={10} />
      {badge}
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-0.5 text-xs font-semibold dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">
        <Trophy size={12} aria-hidden /> 1st
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center gap-1 bg-gray-50 text-gray-600 border border-gray-200 rounded-full px-2.5 py-0.5 text-xs font-semibold dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600">
        <Medal size={12} aria-hidden /> 2nd
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-2.5 py-0.5 text-xs font-semibold dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700">
        <Medal size={12} aria-hidden /> 3rd
      </span>
    );
  }
  return <span className="text-sm text-muted-foreground pl-1">{rank}</span>;
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((n) => n.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-sm text-primary">
      {initials}
    </div>
  );
}

function getRowBorderClass(rank: number): string {
  if (rank === 1) return 'border-l-4 border-l-amber-400';
  if (rank === 2) return 'border-l-4 border-l-gray-400';
  if (rank === 3) return 'border-l-4 border-l-orange-400';
  return 'border-l-4 border-l-transparent';
}

// ── Main Component ────────────────────────────────────────────────────────────

export function LeaderboardClient({ initialStats }: { initialStats: RealtorStats[] }) {
  const [metric, setMetric] = useState<SortMetric>('dealsClosed');
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('month');

  const sorted = useMemo(
    () => [...initialStats].sort((a, b) => b[metric] - a[metric]),
    [initialStats, metric],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Trophy size={20} aria-hidden /> Team Leaderboard
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Top performers for {getCurrentMonthYear()}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as SortMetric)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {(Object.entries(metricLabels) as [SortMetric, string][]).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={timePeriod}
            onChange={(e) => setTimePeriod(e.target.value as TimePeriod)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {(Object.entries(timePeriodLabels) as [TimePeriod, string][]).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-20">
                  Rank
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Deals Closed
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                  Pipeline Value
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-20">
                  Badges
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((agent, idx) => {
                const rank = idx + 1;
                return (
                  <tr
                    key={agent.userId}
                    className={cn(
                      'hover:bg-muted/20 transition-colors',
                      getRowBorderClass(rank),
                    )}
                  >
                    <td className="px-4 py-4">
                      <RankBadge rank={rank} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={agent.name} />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{agent.name}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {agent.badges.map((b) => (
                              <BadgeChip key={b} badge={b} />
                            ))}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums font-medium">
                      {agent.dealsClosed}
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums hidden md:table-cell">
                      {formatValue('pipelineValue', agent.pipelineValue)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {agent.badges.length > 0 && (
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-border text-sm font-medium">
                          {agent.badges.length}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-xs text-muted-foreground">
        Updated daily &middot; Last update: Today at {getCurrentTime()}
      </p>
    </div>
  );
}
