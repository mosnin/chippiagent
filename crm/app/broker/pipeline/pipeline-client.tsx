'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DollarSign,
  Briefcase,
  Trophy,
  XCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Filter,
  ArrowUpDown,
} from 'lucide-react';
import { formatCompact } from '@/lib/formatting';

// ── Types ────────────────────────────────────────────────────────────────────

export type PipelineDeal = {
  id: string;
  title: string;
  value: number | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  closeDate: string | null;
  status: 'active' | 'won' | 'lost' | 'on_hold';
  stageName: string;
  stageColor: string;
  agentName: string;
  agentUserId: string;
  createdAt: string;
  /**
   * Health classification from lib/deals/health.ts. Non-active deals
   * always land as 'on-track' — the classifier treats closed deals as
   * out-of-scope for risk tracking.
   */
  health: 'on-track' | 'at-risk' | 'stuck';
  /** Short human reason, e.g. "18 days in this stage". Empty for on-track. */
  healthReason: string;
};

export type StageInfo = {
  name: string;
  color: string;
  position: number;
};

export type RealtorInfo = {
  userId: string;
  name: string;
};

export type PipelineSummary = {
  totalPipelineValue: number;
  activeDeals: number;
  dealsWonThisMonth: number;
  dealsLostThisMonth: number;
  atRiskCount: number;
  stuckCount: number;
  /** Per-agent rollup, sorted most-stuck first. Empty when no risks. */
  agentRisk: Array<{ agentName: string; atRisk: number; stuck: number }>;
};

type Props = {
  deals: PipelineDeal[];
  stages: StageInfo[];
  realtors: RealtorInfo[];
  summary: PipelineSummary;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const priorityColors: Record<string, string> = {
  HIGH: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/30 dark:border-red-900/40',
  MEDIUM: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-900/40',
  LOW: 'text-muted-foreground bg-muted/50 border-border',
};

const statusLabels: Record<string, string> = {
  active: 'Active',
  won: 'Won',
  lost: 'Lost',
  on_hold: 'On Hold',
};

// ── Component ────────────────────────────────────────────────────────────────

export function PipelineClient({ deals, stages, realtors, summary }: Props) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [realtorFilter, setRealtorFilter] = useState<string>('all');
  const [expandedRealtors, setExpandedRealtors] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<'value' | 'closeDate' | 'createdAt'>('createdAt');
  const [sortAsc, setSortAsc] = useState(false);

  // Filtered deals
  const filteredDeals = useMemo(() => {
    return deals.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (realtorFilter !== 'all' && d.agentUserId !== realtorFilter) return false;
      return true;
    });
  }, [deals, statusFilter, realtorFilter]);

  // Sorted deals
  const sortedDeals = useMemo(() => {
    return [...filteredDeals].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'value') {
        cmp = (a.value ?? 0) - (b.value ?? 0);
      } else if (sortField === 'closeDate') {
        const da = a.closeDate ? new Date(a.closeDate).getTime() : 0;
        const db = b.closeDate ? new Date(b.closeDate).getTime() : 0;
        cmp = da - db;
      } else {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [filteredDeals, sortField, sortAsc]);

  // Pipeline by stage (across all agents)
  const stageAggregates = useMemo(() => {
    const counts = new Map<string, { count: number; value: number }>();
    for (const d of filteredDeals) {
      const prev = counts.get(d.stageName) ?? { count: 0, value: 0 };
      counts.set(d.stageName, {
        count: prev.count + 1,
        value: prev.value + (d.value ?? 0),
      });
    }
    return stages.map((s) => ({
      ...s,
      count: counts.get(s.name)?.count ?? 0,
      value: counts.get(s.name)?.value ?? 0,
    }));
  }, [filteredDeals, stages]);

  const maxStageCount = Math.max(...stageAggregates.map((s) => s.count), 1);

  // Per-agent breakdown
  const agentGroups = useMemo(() => {
    const map = new Map<string, { name: string; deals: PipelineDeal[] }>();
    for (const r of realtors) {
      map.set(r.userId, { name: r.name, deals: [] });
    }
    for (const d of filteredDeals) {
      const group = map.get(d.agentUserId);
      if (group) group.deals.push(d);
    }
    return Array.from(map.entries())
      .map(([userId, data]) => ({ userId, ...data }))
      .sort((a, b) => b.deals.length - a.deals.length);
  }, [filteredDeals, realtors]);

  function toggleRealtor(userId: string) {
    setExpandedRealtors((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function handleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Summary cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Total Pipeline',
            value: formatCompact(summary.totalPipelineValue),
            icon: DollarSign,
          },
          {
            label: 'Active Deals',
            value: String(summary.activeDeals),
            icon: Briefcase,
          },
          {
            label: 'Won This Month',
            value: String(summary.dealsWonThisMonth),
            icon: Trophy,
          },
          {
            label: 'Lost This Month',
            value: String(summary.dealsLostThisMonth),
            icon: XCircle,
          },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="px-4 py-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <p className="text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <Icon size={15} className="text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Risk dashboard ──────────────────────────────────────────── */}
      {/* When there ARE active deals but nothing's flagged, we render a */}
      {/* quiet "all healthy" strip instead of hiding the slot entirely. */}
      {/* Audit finding: an empty slot made brokers wonder whether the   */}
      {/* feature was broken. An empty pipeline (zero active deals)      */}
      {/* still shows nothing — nothing to reassure about.               */}
      {summary.atRiskCount === 0 && summary.stuckCount === 0 && summary.activeDeals > 0 && (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="px-5 py-3 flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0 text-emerald-700 dark:text-emerald-400">
              <Check size={14} aria-label="healthy" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">All pipelines healthy</p>
              <p className="text-xs text-muted-foreground">
                No deals stuck or at risk across {summary.activeDeals} active deal
                {summary.activeDeals === 1 ? '' : 's'}.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {(summary.atRiskCount > 0 || summary.stuckCount > 0) && (
        <Card className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5">
          <CardContent className="px-5 py-4">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                  <span className="text-base" role="img" aria-label="attention">⚠</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Deals needing attention</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="font-medium text-rose-700 dark:text-rose-400">{summary.stuckCount}</span> stuck ·{' '}
                    <span className="font-medium text-amber-700 dark:text-amber-400">{summary.atRiskCount}</span> at-risk
                  </p>
                </div>
              </div>
              {summary.agentRisk.length > 0 && (
                <div className="flex flex-wrap gap-2 ml-auto max-w-full">
                  {summary.agentRisk.slice(0, 4).map((row) => (
                    <span
                      key={row.agentName}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium"
                      title={`${row.agentName}: ${row.stuck} stuck, ${row.atRisk} at-risk`}
                    >
                      <span className="truncate max-w-[120px]">{row.agentName}</span>
                      {row.stuck > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-rose-700 dark:text-rose-400 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          {row.stuck}
                        </span>
                      )}
                      {row.atRisk > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-400 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          {row.atRisk}
                        </span>
                      )}
                    </span>
                  ))}
                  {summary.agentRisk.length > 4 && (
                    <span className="inline-flex items-center text-[11px] text-muted-foreground px-2">
                      +{summary.agentRisk.length - 4} more
                    </span>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Filters ────────────────────────────────────────────── */}
      <Card>
        <CardContent className="px-5 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <Filter size={14} className="text-muted-foreground" />

            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground font-medium">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs border border-border rounded-md px-2 py-1 bg-background"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
                <option value="on_hold">On Hold</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground font-medium">Agent:</label>
              <select
                value={realtorFilter}
                onChange={(e) => setRealtorFilter(e.target.value)}
                className="text-xs border border-border rounded-md px-2 py-1 bg-background"
              >
                <option value="all">All Agents</option>
                {realtors.map((r) => (
                  <option key={r.userId} value={r.userId}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-xs text-muted-foreground ml-auto">
              {filteredDeals.length} deal{filteredDeals.length !== 1 ? 's' : ''}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Pipeline by stage (horizontal bars) ───────────────── */}
      <Card>
        <CardContent className="px-5 py-4">
          <h2 className="text-sm font-semibold mb-4">Pipeline by Stage</h2>

          {stageAggregates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No stages found.
            </p>
          ) : (
            <div className="space-y-3">
              {stageAggregates.map((stage) => (
                <div key={stage.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: stage.color }}
                      />
                      <span className="text-sm font-medium">{stage.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold tabular-nums">{stage.count}</span>
                      {stage.value > 0 && (
                        <span className="text-xs text-muted-foreground ml-1.5">
                          ({formatCompact(stage.value)})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(stage.count > 0 ? 4 : 0, (stage.count / maxStageCount) * 100)}%`,
                        backgroundColor: stage.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Per-agent accordion ────────────────────────────────── */}
      <Card>
        <CardContent className="px-5 py-4">
          <h2 className="text-sm font-semibold mb-4">Per-Agent Breakdown</h2>

          {agentGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No realtors found.
            </p>
          ) : (
            <div className="space-y-1">
              {agentGroups.map((agent) => {
                const isExpanded = expandedRealtors.has(agent.userId);
                const agentValue = agent.deals.reduce((s, d) => s + (d.value ?? 0), 0);
                const agentActive = agent.deals.filter((d) => d.status === 'active').length;
                const agentWon = agent.deals.filter((d) => d.status === 'won').length;

                return (
                  <div key={agent.userId} className="border border-border rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleRealtor(agent.userId)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
                      )}
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs flex-shrink-0">
                        {agent.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{agent.name}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                        <span>{agent.deals.length} deals</span>
                        <span>{agentActive} active</span>
                        <span className="text-green-600 dark:text-green-400">{agentWon} won</span>
                        {agentValue > 0 && (
                          <span className="font-semibold text-foreground">
                            {formatCompact(agentValue)}
                          </span>
                        )}
                      </div>
                    </button>

                    {isExpanded && agent.deals.length > 0 && (
                      <div className="border-t border-border">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border bg-muted/30">
                                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Title</th>
                                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Stage</th>
                                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Value</th>
                                <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">Priority</th>
                                <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">Status</th>
                                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Close Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {agent.deals.map((deal) => (
                                <tr key={deal.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                                  <td className="px-4 py-2 font-medium max-w-[200px]">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <HealthDot health={deal.health} reason={deal.healthReason} />
                                      <span className="truncate">{deal.title}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: deal.stageColor }}
                                      />
                                      <span className="text-xs">{deal.stageName}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-right tabular-nums">
                                    {deal.value != null ? formatCurrency(deal.value) : '--'}
                                  </td>
                                  <td className="px-4 py-2 text-center">
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] px-1.5 ${priorityColors[deal.priority] ?? ''}`}
                                    >
                                      {deal.priority}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-2 text-center">
                                    <Badge
                                      variant={deal.status === 'won' ? 'default' : deal.status === 'lost' ? 'destructive' : 'secondary'}
                                      className="text-[10px] px-1.5"
                                    >
                                      {statusLabels[deal.status] ?? deal.status}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                                    {formatDate(deal.closeDate)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Full deal table ────────────────────────────────────── */}
      <Card>
        <CardContent className="px-5 py-4">
          <h2 className="text-sm font-semibold mb-4">All Deals</h2>

          {sortedDeals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No deals found matching filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Title</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Agent</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Stage</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">
                      <button
                        onClick={() => handleSort('value')}
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      >
                        Value
                        <ArrowUpDown size={10} />
                      </button>
                    </th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">Priority</th>
                    <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">
                      <button
                        onClick={() => handleSort('closeDate')}
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      >
                        Close Date
                        <ArrowUpDown size={10} />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDeals.map((deal) => (
                    <tr key={deal.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2.5 font-medium max-w-[200px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <HealthDot health={deal.health} reason={deal.healthReason} />
                          <span className="truncate">{deal.title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{deal.agentName}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: deal.stageColor }}
                          />
                          <span className="text-xs">{deal.stageName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {deal.value != null ? formatCurrency(deal.value) : '--'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 ${priorityColors[deal.priority] ?? ''}`}
                        >
                          {deal.priority}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge
                          variant={deal.status === 'won' ? 'default' : deal.status === 'lost' ? 'destructive' : 'secondary'}
                          className="text-[10px] px-1.5"
                        >
                          {statusLabels[deal.status] ?? deal.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                        {formatDate(deal.closeDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Indicator next to a deal title for its health state.
 *
 * On-track renders nothing (visual noise at 50+ deals). At-risk and stuck
 * use BOTH colour and shape so the signal survives red/green colourblind
 * vision — at 2px, tint alone was indistinguishable (audit finding):
 *   - at-risk → filled amber dot (3x3).
 *   - stuck   → filled rose dot (3x3) with a visible ring so the outline
 *               reads even in monochrome.
 */
function HealthDot({ health, reason }: { health: PipelineDeal['health']; reason: string }) {
  if (health === 'on-track') return null;
  const isStuck = health === 'stuck';
  const colorClass = isStuck
    ? 'bg-rose-500 ring-2 ring-rose-300 dark:ring-rose-900'
    : 'bg-amber-500';
  const label = isStuck ? 'Stuck' : 'At risk';
  return (
    <span
      className={`inline-block w-3 h-3 rounded-full flex-shrink-0 ${colorClass}`}
      title={reason ? `${label} — ${reason}` : label}
      aria-label={reason ? `${label}: ${reason}` : label}
    />
  );
}
