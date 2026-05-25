'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from 'recharts';
import { cn } from '@/lib/utils';
import { ArrowDownRight } from 'lucide-react';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import {
  StatCell,
  ChartSection,
  PAPER_GRID,
} from './chart-primitives';
import {
  H1,
  H2,
  TITLE_FONT,
  BODY_MUTED,
  CAPTION,
  SECTION_RHYTHM,
  STAT_NUMBER,
  PRIMARY_PILL,
} from '@/lib/typography';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FunnelStep {
  stepIndex: number;
  stepTitle: string;
  uniqueSessions: number;
  avgDurationMs: number | null;
}

interface DropOffStep {
  stepIndex: number;
  stepTitle: string;
  dropOffPercent: number;
}

interface RecentLead {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  scoreLabel: string | null;
  leadScore: number | null;
}

interface FormAnalyticsResponse {
  days: number;
  totalSessions: number;
  totalStarts: number;
  totalSubmits: number;
  totalAbandons: number;
  completionRate: number;
  funnel: FunnelStep[];
  dropOff: DropOffStep[];
  recentLeads: RecentLead[];
}

// ── Number formatting ─────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remaining = s % 60;
  return remaining > 0 ? `${m}m ${remaining}s` : `${m}m`;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// ── Time period selector — paper-flat segmented control ───────────────────────

const PERIODS = [
  { label: 'Last 7 days', shortLabel: '7 days', days: 7 },
  { label: 'Last 30 days', shortLabel: '30 days', days: 30 },
  { label: 'Last 90 days', shortLabel: '90 days', days: 90 },
] as const;

function TimePeriodSelector({
  days,
  onChange,
}: {
  days: number;
  onChange: (d: number) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Time period"
      className="inline-flex items-center gap-px p-px rounded-full bg-foreground/[0.04] border border-border/70"
    >
      {PERIODS.map((p) => {
        const active = days === p.days;
        return (
          <button
            key={p.days}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={p.label}
            onClick={() => onChange(p.days)}
            className={cn(
              'px-3 h-8 sm:h-7 text-xs rounded-full transition-all duration-150 active:scale-[0.98]',
              active
                ? 'bg-background text-foreground font-medium border border-border/70'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {p.shortLabel}
          </button>
        );
      })}
    </div>
  );
}

// ── Score badge — paper-flat hairline pill ────────────────────────────────────

function ScoreBadge({ label, score }: { label: string | null; score: number | null }) {
  const display = label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Unscored';
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground border border-border/70 rounded-md px-1.5 py-0.5">
      {display}
      {score != null && <span className="tabular-nums">{score}</span>}
    </span>
  );
}

// ── Skeleton loading ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className={`${SECTION_RHYTHM} animate-pulse`} aria-busy="true" aria-label="Loading form analytics">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-background p-5">
            <div className="h-7 w-16 bg-foreground/[0.06] rounded" />
            <div className="h-3 w-20 bg-foreground/[0.06] rounded mt-3" />
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border/70 bg-background p-5">
          <div className="h-4 w-32 bg-foreground/[0.06] rounded" />
          <div className="h-3 w-48 bg-foreground/[0.06] rounded mt-2" />
          <div className="h-[200px] bg-foreground/[0.04] rounded mt-4" />
        </div>
        <div className="rounded-xl border border-border/70 bg-background p-5">
          <div className="h-4 w-32 bg-foreground/[0.06] rounded" />
          <div className="h-3 w-48 bg-foreground/[0.06] rounded mt-2" />
          <div className="space-y-3 mt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-6 bg-foreground/[0.04] rounded" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Chart configs ─────────────────────────────────────────────────────────────

const funnelChartConfig = {
  users: { label: 'Users', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

const avgTimeChartConfig = {
  seconds: { label: 'Avg seconds', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

// ── Main component ────────────────────────────────────────────────────────────

export function FormAnalytics({
  slug,
  standalone = false,
  showRecentLeads = false,
}: {
  slug: string;
  standalone?: boolean;
  showRecentLeads?: boolean;
}) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<FormAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/form-analytics?slug=${encodeURIComponent(slug)}&days=${days}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Failed to load analytics');
      }
      const json = await res.json();
      setData(json);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Couldn't load the analytics. Try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [slug, days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Optional standalone header (used when this component is the entire page).
  const StandaloneHeader = standalone ? (
    <header>
      <h1 className={H1} style={TITLE_FONT}>
        Form analytics
      </h1>
    </header>
  ) : null;

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={SECTION_RHYTHM}>
        {StandaloneHeader}
        <LoadingSkeleton />
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className={SECTION_RHYTHM}>
        {StandaloneHeader}
        <div
          role="alert"
          className="rounded-xl border border-border/70 bg-background px-6 py-12 text-center space-y-3"
        >
          <p className="text-sm text-foreground font-medium">{error}</p>
          <button onClick={fetchData} className={PRIMARY_PILL}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  if (!data || data.totalStarts === 0) {
    return (
      <div className={SECTION_RHYTHM}>
        <div className="flex items-center justify-between gap-3">
          <p className={BODY_MUTED}>
            Track how applicants interact with your intake form.
          </p>
          <TimePeriodSelector days={days} onChange={setDays} />
        </div>
        <div className="rounded-xl border border-border/70 bg-background px-6 py-16 text-center">
          <p className={H1} style={TITLE_FONT}>
            Nothing to chart yet.
          </p>
          <p className={`${BODY_MUTED} mt-2 max-w-sm mx-auto`}>
            Once applicants start hitting your form, the charts show up here.
          </p>
        </div>
      </div>
    );
  }

  // ── Prepare chart data ────────────────────────────────────────────────────

  const funnelChartData = [
    { name: 'Started', users: data.totalStarts },
    ...data.funnel.map((step: FunnelStep) => ({
      name: step.stepTitle,
      users: step.uniqueSessions,
    })),
    { name: 'Submitted', users: data.totalSubmits },
  ];

  const avgTimeData = data.funnel
    .filter((step: FunnelStep) => step.avgDurationMs != null)
    .map((step: FunnelStep) => ({
      name: step.stepTitle,
      seconds: Math.round((step.avgDurationMs ?? 0) / 1000),
      display: fmtDuration(step.avgDurationMs ?? 0),
    }));

  // Find worst drop-off step
  const worstDropOff = data.dropOff.reduce(
    (max: DropOffStep, step: DropOffStep) =>
      step.dropOffPercent > max.dropOffPercent ? step : max,
    { stepIndex: -1, stepTitle: '', dropOffPercent: 0 },
  );

  // Total avg time across all steps
  const totalAvgTime = data.funnel.reduce(
    (sum, step) => sum + (step.avgDurationMs ?? 0),
    0,
  );

  // Funnel bar fill — gradient from foreground (start) to muted (end), lighter as users drop.
  const funnelFill = (i: number) => {
    const max = funnelChartData.length - 1;
    const t = max > 0 ? i / max : 0;
    // Closer to start = darker. End = muted/lighter.
    if (t < 0.2) return 'hsl(var(--foreground))';
    if (t < 0.5) return 'hsl(var(--foreground) / 0.7)';
    if (t < 0.8) return 'hsl(var(--foreground) / 0.55)';
    return 'hsl(var(--foreground) / 0.4)';
  };

  return (
    <div className={SECTION_RHYTHM}>
      {/* Header with time selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {StandaloneHeader ?? (
          <p className={BODY_MUTED}>
            How applicants interact with your intake form.
          </p>
        )}
        <TimePeriodSelector days={days} onChange={setDays} />
      </div>

      {/* Key metrics strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70">
        <StatCell
          label="Visitors"
          value={fmtNum(data.totalStarts)}
          sub={`${fmtNum(data.totalSessions)} unique sessions`}
        />
        <StatCell
          label="Conversions"
          value={fmtNum(data.totalSubmits)}
          sub={`${data.completionRate}% completion`}
        />
        <StatCell
          label="Abandoned"
          value={fmtNum(data.totalAbandons)}
          sub={
            worstDropOff.dropOffPercent > 0
              ? `Worst: ${worstDropOff.stepTitle}`
              : 'No drop-off data'
          }
        />
        <StatCell
          label="Avg completion time"
          value={totalAvgTime > 0 ? fmtDuration(totalAvgTime) : '--'}
          sub={
            data.funnel.length > 0
              ? `Across ${data.funnel.length} step${data.funnel.length !== 1 ? 's' : ''}`
              : 'No timing data'
          }
        />
      </div>

      {/* Charts row */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Completion funnel */}
        <ChartSection title="Completion funnel" sub="Users retained at each step">
          <ChartContainer config={funnelChartConfig} className="h-[240px] w-full">
            <BarChart data={funnelChartData} barSize={32}>
              <CartesianGrid vertical={false} stroke={PAPER_GRID} strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 10 }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={50}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={36}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="users" radius={[2, 2, 0, 0]}>
                {funnelChartData.map((_entry, i) => (
                  <Cell key={i} fill={funnelFill(i)} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartSection>

        {/* Drop-off analysis */}
        {data.dropOff.length > 0 && (
          <ChartSection title="Drop-off analysis" sub="Percentage of users lost at each step">
            <div className="space-y-2.5">
              {data.dropOff.map((step: DropOffStep) => {
                const isWorst =
                  step.dropOffPercent === worstDropOff.dropOffPercent &&
                  step.dropOffPercent > 0;
                return (
                  <div key={step.stepIndex} className="flex items-center gap-3">
                    <span
                      className="text-xs text-muted-foreground w-28 text-right flex-shrink-0 truncate"
                      title={step.stepTitle}
                    >
                      {step.stepTitle}
                    </span>
                    <div className="flex-1 h-7 bg-foreground/[0.04] rounded-md overflow-hidden relative border border-border/70">
                      <div
                        className={cn(
                          'h-full transition-all duration-150',
                          isWorst
                            ? 'bg-foreground/80'
                            : 'bg-foreground/40',
                        )}
                        style={{
                          width: `${Math.max(step.dropOffPercent, 2)}%`,
                        }}
                        role="meter"
                        aria-valuenow={step.dropOffPercent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${step.stepTitle}: ${step.dropOffPercent}% drop-off`}
                      />
                      <span className="absolute inset-y-0 left-2.5 flex items-center text-xs font-medium text-foreground tabular-nums mix-blend-difference">
                        {step.dropOffPercent}%
                      </span>
                      {isWorst && (
                        <span className="absolute inset-y-0 right-2 flex items-center">
                          <ArrowDownRight size={12} className="text-muted-foreground" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartSection>
        )}

        {/* Avg time per step */}
        {avgTimeData.length > 0 && (
          <ChartSection title="Average time per step" sub="How long users spend on each form section">
            <ChartContainer config={avgTimeChartConfig} className="h-[240px] w-full">
              <BarChart data={avgTimeData} layout="vertical" barSize={16} margin={{ left: 0 }}>
                <CartesianGrid horizontal={false} stroke={PAPER_GRID} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 11 }}
                  unit="s"
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={90}
                  tick={{ fontSize: 10 }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="seconds" radius={[0, 2, 2, 0]} fill="var(--color-seconds)" />
              </BarChart>
            </ChartContainer>
          </ChartSection>
        )}

        {/* Conversion rate visual */}
        <ChartSection title="Conversion rate" sub="Visitors who completed the form">
          <div className="flex flex-col items-center justify-center py-4">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="currentColor"
                  className="text-muted-foreground/20"
                  strokeWidth="10"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="currentColor"
                  className="text-foreground"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${(data.completionRate / 100) * 2 * Math.PI * 52} ${2 * Math.PI * 52}`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={STAT_NUMBER} style={TITLE_FONT}>
                  {data.completionRate}%
                </span>
              </div>
            </div>
            <p className={`${CAPTION} mt-3 text-center`}>
              {fmtNum(data.totalSubmits)} of {fmtNum(data.totalStarts)} visitors completed the form
            </p>
          </div>
        </ChartSection>
      </div>

      {/* Recent leads — hairline list */}
      {(standalone || showRecentLeads) && data.recentLeads && data.recentLeads.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className={H2}>Recent leads</h2>
            <p className={CAPTION}>
              Last {data.recentLeads.length} from form submissions
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background overflow-hidden divide-y divide-border/70">
            {data.recentLeads.map((lead) => {
              const initials =
                lead.name
                  ?.split(' ')
                  ?.map((n: string) => n?.[0])
                  ?.join('')
                  ?.toUpperCase()
                  ?.slice(0, 2) || '??';
              return (
                <div
                  key={lead.id}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-foreground/[0.04] active:bg-foreground/[0.045] transition-colors duration-150"
                >
                  <div className="w-9 h-9 rounded-full bg-foreground/[0.06] text-muted-foreground flex items-center justify-center text-[11px] font-medium flex-shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {lead.name || 'Unknown'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground truncate">
                        {lead.email || '--'}
                      </span>
                      <ScoreBadge label={lead.scoreLabel} score={lead.leadScore} />
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                    {timeAgo(lead.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
