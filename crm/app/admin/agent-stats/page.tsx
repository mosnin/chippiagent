import { supabase } from '@/lib/supabase';
import { isPlatformAdmin } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Bot, Zap, DollarSign, AlertTriangle, TrendingUp, Activity } from 'lucide-react';

export const metadata = { title: 'Agent System Health — Admin' };

type AgentStatsResponse = {
  days: number;
  totalTasks: number;
  tasksByStatus: Record<string, number>;
  avgCostUsd: number;
  totalCostUsd: number;
  topTools: { name: string; callCount: number }[];
  errorRate: number;
  tasksBySpace: { spaceId: string; count: number; cost: number }[];
};

async function fetchAgentStats(days: number): Promise<AgentStatsResponse> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  // Parallel queries — all aggregated in JS, no full-table scans beyond the window
  const [statusRes, costRes, stepRes, spaceRes] = await Promise.all([
    supabase.from('AgentTask').select('status').gte('createdAt', since),
    supabase.from('AgentTask').select('estimatedCostUsd').gte('createdAt', since),
    supabase
      .from('ExecutionStep')
      .select('toolName, AgentTask!inner(createdAt)')
      .gte('AgentTask.createdAt', since),
    supabase.from('AgentTask').select('spaceId, estimatedCostUsd').gte('createdAt', since),
  ]);

  // Status breakdown
  const tasksByStatus: Record<string, number> = {};
  let totalTasks = 0;
  let failedCount = 0;
  for (const row of statusRes.data ?? []) {
    const s = row.status as string;
    tasksByStatus[s] = (tasksByStatus[s] ?? 0) + 1;
    totalTasks++;
    if (s === 'failed') failedCount++;
  }

  // Cost
  let totalCostUsd = 0;
  for (const row of (costRes.data ?? []) as { estimatedCostUsd: string | number | null }[]) {
    totalCostUsd += parseFloat(String(row.estimatedCostUsd ?? 0));
  }
  const avgCostUsd = totalTasks > 0 ? totalCostUsd / totalTasks : 0;

  // Top tools
  const toolCounts: Record<string, number> = {};
  for (const row of stepRes.data ?? []) {
    const name = (row as { toolName: string }).toolName;
    toolCounts[name] = (toolCounts[name] ?? 0) + 1;
  }
  const topTools = Object.entries(toolCounts)
    .map(([name, callCount]) => ({ name, callCount }))
    .sort((a, b) => b.callCount - a.callCount)
    .slice(0, 10);

  // By space
  const spaceMap: Record<string, { count: number; cost: number }> = {};
  for (const row of (spaceRes.data ?? []) as {
    spaceId: string;
    estimatedCostUsd: string | number | null;
  }[]) {
    const entry = spaceMap[row.spaceId] ?? { count: 0, cost: 0 };
    entry.count++;
    entry.cost += parseFloat(String(row.estimatedCostUsd ?? 0));
    spaceMap[row.spaceId] = entry;
  }
  const tasksBySpace = Object.entries(spaceMap)
    .map(([spaceId, { count, cost }]) => ({ spaceId, count, cost }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    days,
    totalTasks,
    tasksByStatus,
    avgCostUsd: parseFloat(avgCostUsd.toFixed(6)),
    totalCostUsd: parseFloat(totalCostUsd.toFixed(6)),
    topTools,
    errorRate: parseFloat((totalTasks > 0 ? (failedCount / totalTasks) * 100 : 0).toFixed(2)),
    tasksBySpace,
  };
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

function ErrorRateBadge({ rate }: { rate: number }) {
  const color =
    rate > 5
      ? 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/15'
      : rate > 1
        ? 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15'
        : 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15';

  return (
    <span className={`inline-flex text-xs font-semibold rounded-full px-2.5 py-0.5 tabular-nums ${color}`}>
      {rate.toFixed(1)}%
    </span>
  );
}

export default async function AgentStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect('/');

  const { days: daysParam } = await searchParams;
  const days = Math.min(Math.max(1, parseInt(daysParam ?? '30', 10) || 30), 365);

  let stats: AgentStatsResponse | null = null;
  let fetchError = false;

  try {
    stats = await fetchAgentStats(days);
  } catch (err) {
    console.error('[admin/agent-stats] page data fetch failed', err);
    fetchError = true;
  }

  if (fetchError || !stats) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            Could not load agent stats. This is usually temporary.
          </p>
          <a
            href="/admin/agent-stats"
            className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  const successCount =
    (stats.tasksByStatus['completed'] ?? 0);
  const successRate =
    stats.totalTasks > 0 ? (successCount / stats.totalTasks) * 100 : 0;

  // Build top tool bar widths
  const maxToolCalls = stats.topTools[0]?.callCount ?? 1;

  const dayOptions = [7, 30, 90];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agent System Health</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Last {days} day{days !== 1 ? 's' : ''} · all spaces
          </p>
        </div>
        {/* Time range switcher */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          {dayOptions.map((d) => (
            <a
              key={d}
              href={`/admin/agent-stats?days=${d}`}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                days === d
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {d}d
            </a>
          ))}
        </div>
      </div>

      {/* Key metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Tasks */}
        <Card className="rounded-xl border bg-card">
          <CardContent className="p-6 flex flex-col justify-between h-full">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-medium">Total Tasks</p>
                <p className="text-2xl font-bold mt-0.5 tabular-nums">{fmt(stats.totalTasks)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {fmt(stats.tasksByStatus['completed'] ?? 0)} completed
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted">
                <Bot size={15} className="text-violet-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Success Rate */}
        <Card className="rounded-xl border bg-card">
          <CardContent className="p-6 flex flex-col justify-between h-full">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-medium">Success Rate</p>
                <p className="text-2xl font-bold mt-0.5 tabular-nums">
                  {successRate.toFixed(1)}%
                </p>
                <div className="mt-1">
                  <ErrorRateBadge rate={stats.errorRate} />
                  <span className="text-[11px] text-muted-foreground ml-1">error rate</span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted">
                <Activity size={15} className="text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Cost */}
        <Card className="rounded-xl border bg-card">
          <CardContent className="p-6 flex flex-col justify-between h-full">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-medium">Total Cost</p>
                <p className="text-2xl font-bold mt-0.5 tabular-nums">
                  {fmtCost(stats.totalCostUsd)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">USD, all spaces</p>
              </div>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted">
                <DollarSign size={15} className="text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Avg Cost / Task */}
        <Card className="rounded-xl border bg-card">
          <CardContent className="p-6 flex flex-col justify-between h-full">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-medium">Avg Cost / Task</p>
                <p className="text-2xl font-bold mt-0.5 tabular-nums">
                  {fmtCost(stats.avgCostUsd)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">per task run</p>
              </div>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted">
                <TrendingUp size={15} className="text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status breakdown + Top tools (side by side) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status breakdown */}
        <Card className="rounded-xl border bg-card">
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Tasks by Status
            </h2>
            {stats.totalTasks === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks in this period.</p>
            ) : (
              <div className="space-y-3">
                {(['completed', 'running', 'queued', 'paused', 'failed', 'cancelled'] as const).map(
                  (status) => {
                    const count = stats!.tasksByStatus[status] ?? 0;
                    if (count === 0) return null;
                    const pct =
                      stats!.totalTasks > 0
                        ? Math.round((count / stats!.totalTasks) * 100)
                        : 0;
                    const color: Record<string, string> = {
                      completed: 'bg-emerald-500',
                      running: 'bg-blue-500',
                      queued: 'bg-slate-400',
                      paused: 'bg-amber-400',
                      failed: 'bg-red-500',
                      cancelled: 'bg-gray-400',
                    };
                    return (
                      <div key={status}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground capitalize">{status}</span>
                          <span className="font-semibold tabular-nums">
                            {fmt(count)}{' '}
                            <span className="text-muted-foreground font-normal">({pct}%)</span>
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${color[status]}`}
                            style={{ width: `${Math.max(pct, 1)}%` }}
                          />
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top 10 Tools */}
        <Card className="rounded-xl border bg-card">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={14} className="text-amber-500" />
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Top Tools
              </h2>
            </div>
            {stats.topTools.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tool calls recorded in this period.</p>
            ) : (
              <ol className="space-y-2.5">
                {stats.topTools.map((tool, i) => {
                  const pct = Math.round((tool.callCount / maxToolCalls) * 100);
                  return (
                    <li key={tool.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-muted-foreground/60 tabular-nums w-4 text-right flex-shrink-0">
                            {i + 1}
                          </span>
                          <span className="font-medium font-mono truncate text-foreground">
                            {tool.name}
                          </span>
                        </div>
                        <span className="font-semibold tabular-nums flex-shrink-0 ml-3">
                          {fmt(tool.callCount)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden ml-6">
                        <div
                          className="h-full bg-amber-400 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tasks by Space */}
      <Card className="rounded-xl border bg-card">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Tasks by Space
            </h2>
            <span className="text-xs text-muted-foreground">Top 20 by task count</span>
          </div>
          {stats.tasksBySpace.length === 0 ? (
            <p className="text-sm text-muted-foreground">No task data in this period.</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-4 font-medium">#</th>
                    <th className="pb-2 pr-4 font-medium">Space ID</th>
                    <th className="pb-2 pr-4 font-medium text-right">Tasks</th>
                    <th className="pb-2 font-medium text-right">Total Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.tasksBySpace.map((row, i) => (
                    <tr key={row.spaceId} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pr-4 text-xs text-muted-foreground tabular-nums">
                        {i + 1}
                      </td>
                      <td className="py-2.5 pr-4">
                        <a
                          href={`/admin/spaces?q=${encodeURIComponent(row.spaceId)}`}
                          className="font-mono text-xs text-primary hover:underline underline-offset-2 truncate block max-w-[200px] sm:max-w-xs"
                          title={row.spaceId}
                        >
                          {row.spaceId}
                        </a>
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums font-semibold">
                        {fmt(row.count)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-amber-600 dark:text-amber-400 font-semibold">
                        {fmtCost(row.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border">
                  <tr>
                    <td colSpan={2} className="pt-3 text-xs text-muted-foreground font-medium">
                      Total (shown)
                    </td>
                    <td className="pt-3 text-right tabular-nums font-bold">
                      {fmt(stats.tasksBySpace.reduce((a, r) => a + r.count, 0))}
                    </td>
                    <td className="pt-3 text-right tabular-nums font-bold text-amber-600 dark:text-amber-400">
                      {fmtCost(stats.tasksBySpace.reduce((a, r) => a + r.cost, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">
          Showing data from the last {days} day{days !== 1 ? 's' : ''} ·{' '}
          {new Date().toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })}
        </p>
      </div>
    </div>
  );
}
