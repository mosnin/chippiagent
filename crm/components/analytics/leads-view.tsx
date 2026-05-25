'use client';

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import {
  StatCell,
  ChartSection,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  PAPER_SERIES,
  PAPER_GRID,
} from './chart-primitives';
import type { ChartConfig } from './chart-primitives';
import type { LeadsAnalyticsData } from '@/lib/analytics-data';
import { SECTION_RHYTHM, BODY_MUTED } from '@/lib/typography';

const leadsVolumeConfig = {
  count: { label: 'Leads', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

const scoreBucketsConfig = {
  count: { label: 'Leads', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

const employmentConfig = {
  count: { label: 'Leads', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

const affordabilityConfig = {
  'Passes 3x rule': { label: 'Passes 3x rule', color: 'hsl(var(--foreground))' },
  'Below 3x rule': { label: 'Below 3x rule', color: 'hsl(var(--muted-foreground) / 0.4)' },
} satisfies ChartConfig;

const urgencyConfig = {
  count: { label: 'Leads', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

const screeningConfig = {
  count: { label: 'Leads', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

const leadStateConfig = {
  count: { label: 'Leads', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

const riskFlagsConfig = {
  count: { label: 'Leads', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

const avgScoreConfig = {
  avg: { label: 'Avg score', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

const buyerBudgetConfig = {
  count: { label: 'Buyers', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

// Graytone ordered scales — Hot is darkest (most attention), Unscored is faintest.
const SCORE_BUCKET_FILLS: Record<string, string> = {
  Hot: 'hsl(var(--foreground))',
  Warm: 'hsl(var(--foreground) / 0.7)',
  Cold: 'hsl(var(--muted-foreground) / 0.5)',
  Unscored: 'hsl(var(--muted-foreground) / 0.25)',
};

const URGENCY_FILLS: Record<string, string> = {
  Overdue: 'hsl(var(--foreground))',
  '≤ 30 days': 'hsl(var(--foreground) / 0.8)',
  '31-60 days': 'hsl(var(--foreground) / 0.55)',
  '61-90 days': 'hsl(var(--muted-foreground) / 0.5)',
  '90+ days': 'hsl(var(--muted-foreground) / 0.35)',
  'Not provided': 'hsl(var(--muted-foreground) / 0.2)',
};

const BUYER_BUDGET_FILLS: Record<string, string> = {
  'Under $200K': 'hsl(var(--muted-foreground) / 0.3)',
  '$200K-$400K': 'hsl(var(--muted-foreground) / 0.5)',
  '$400K-$600K': 'hsl(var(--foreground) / 0.55)',
  '$600K-$800K': 'hsl(var(--foreground) / 0.7)',
  '$800K-$1M': 'hsl(var(--foreground) / 0.85)',
  'Over $1M': 'hsl(var(--foreground))',
};

export function LeadsView({ data }: { data: LeadsAnalyticsData }) {
  const totalAffordability = data.affordabilityBuckets.reduce((s, b) => s + b.count, 0);
  const passRate =
    data.affordabilityBuckets.length > 0 && totalAffordability > 0
      ? `${Math.round(((data.affordabilityBuckets.find((b) => b.label === 'Passes 3x rule')?.count ?? 0) / totalAffordability) * 100)}%`
      : '--';

  return (
    <div className={SECTION_RHYTHM}>
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70">
        <StatCell label="Total leads" value={data.totalLeads} sub="all time" />
        <StatCell
          label="Avg score"
          value={data.avgLeadScore != null ? Math.round(data.avgLeadScore) : '--'}
          sub="out of 100"
        />
        <StatCell
          label="Hot leads"
          value={data.leadScoreBuckets.find((b) => b.label === 'Hot')?.count ?? 0}
          sub="score >= 75"
        />
        <StatCell
          label="Buyer leads"
          value={data.buyerLeadCount}
          sub={`${data.rentalLeadCount} rental`}
        />
      </div>

      {/* Volume + scoring */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ChartSection title="Lead volume over time" sub="New leads submitted each month">
          <ChartContainer config={leadsVolumeConfig} className="h-[220px] w-full">
            <AreaChart data={data.leadsOverTime}>
              <defs>
                <linearGradient id="leadsGradLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={PAPER_GRID} strokeDasharray="3 3" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={32} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="count"
                name="Leads"
                stroke="var(--color-count)"
                fill="url(#leadsGradLeads)"
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ChartContainer>
        </ChartSection>

        <ChartSection title="Score distribution" sub="Leads grouped by AI score tier">
          <ChartContainer config={scoreBucketsConfig} className="h-[220px] w-full">
            <BarChart data={data.leadScoreBuckets} barSize={32}>
              <CartesianGrid vertical={false} stroke={PAPER_GRID} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={32} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" name="Leads" radius={[2, 2, 0, 0]}>
                {data.leadScoreBuckets.map((entry) => (
                  <Cell
                    key={entry.label}
                    fill={SCORE_BUCKET_FILLS[entry.label] ?? 'hsl(var(--muted-foreground) / 0.4)'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartSection>
      </div>

      {/* Qualification metrics strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70">
        <StatCell label="Pass affordability" value={passRate} sub="pass 3x rent rule" />
        <StatCell
          label="Screening flags"
          value={data.screeningFlags.reduce((s, f) => s + f.count, 0)}
          sub="across all leads"
        />
        <StatCell
          label="Moving <= 30 days"
          value={data.moveInUrgency.find((b) => b.label === '≤ 30 days')?.count ?? 0}
          sub="high urgency"
        />
        <StatCell
          label="Buyer share"
          value={
            data.totalLeads > 0
              ? `${Math.round((data.buyerLeadCount / data.totalLeads) * 100)}%`
              : '--'
          }
          sub="of total leads"
        />
      </div>

      {/* Qualification breakdowns */}
      <div className="grid sm:grid-cols-2 gap-4">
        {data.employmentBreakdown.length > 0 && (
          <ChartSection title="Employment status" sub="How leads are currently employed">
            <ChartContainer config={employmentConfig} className="h-[220px] w-full">
              <BarChart data={data.employmentBreakdown} layout="vertical" barSize={14} margin={{ left: 0 }}>
                <CartesianGrid horizontal={false} stroke={PAPER_GRID} strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tickMargin={8} width={80} tick={{ fontSize: 10 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" name="Leads" radius={[0, 2, 2, 0]} fill="var(--color-count)" />
              </BarChart>
            </ChartContainer>
          </ChartSection>
        )}

        {data.affordabilityBuckets.length > 0 && (
          <ChartSection title="Income affordability" sub="Leads who meet the 3x monthly rent rule">
            <ChartContainer config={affordabilityConfig} className="h-[220px] w-full">
              <PieChart>
                <Pie
                  data={data.affordabilityBuckets}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                >
                  {data.affordabilityBuckets.map((entry, i) => (
                    <Cell
                      key={entry.label}
                      fill={
                        i === 0
                          ? 'hsl(var(--foreground))'
                          : 'hsl(var(--muted-foreground) / 0.4)'
                      }
                    />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <ChartLegend content={<ChartLegendContent nameKey="label" />} />
              </PieChart>
            </ChartContainer>
          </ChartSection>
        )}

        {data.moveInUrgency.length > 0 && (
          <ChartSection title="Move-in urgency" sub="How soon leads want to move in">
            <ChartContainer config={urgencyConfig} className="h-[200px] w-full">
              <BarChart data={data.moveInUrgency} barSize={28}>
                <CartesianGrid vertical={false} stroke={PAPER_GRID} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={32} tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" name="Leads" radius={[2, 2, 0, 0]}>
                  {data.moveInUrgency.map((entry) => (
                    <Cell
                      key={entry.label}
                      fill={URGENCY_FILLS[entry.label] ?? 'hsl(var(--muted-foreground) / 0.4)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </ChartSection>
        )}

        {data.screeningFlags.length > 0 && (
          <ChartSection title="Screening flags" sub="Leads with disclosed issues">
            <ChartContainer config={screeningConfig} className="h-[200px] w-full">
              <BarChart data={data.screeningFlags} layout="vertical" barSize={14} margin={{ left: 8 }}>
                <CartesianGrid horizontal={false} stroke={PAPER_GRID} strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tickMargin={8} width={90} tick={{ fontSize: 10 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" name="Leads" radius={[0, 2, 2, 0]} fill="var(--color-count)" />
              </BarChart>
            </ChartContainer>
          </ChartSection>
        )}

        {data.leadStateDistribution.length > 0 && (
          <ChartSection title="AI lead state" sub="How the AI has categorized your leads">
            <ChartContainer config={leadStateConfig} className="h-[220px] w-full">
              <PieChart>
                <Pie
                  data={data.leadStateDistribution}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                >
                  {data.leadStateDistribution.map((entry, i) => (
                    <Cell key={entry.label} fill={PAPER_SERIES[i % PAPER_SERIES.length]} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <ChartLegend content={<ChartLegendContent nameKey="label" />} />
              </PieChart>
            </ChartContainer>
          </ChartSection>
        )}

        {data.topRiskFlags.length > 0 && (
          <ChartSection title="Top AI risk flags" sub="Most common risks flagged across leads">
            <ChartContainer config={riskFlagsConfig} className="h-[220px] w-full">
              <BarChart data={data.topRiskFlags} layout="vertical" barSize={12} margin={{ left: 8 }}>
                <CartesianGrid horizontal={false} stroke={PAPER_GRID} strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tickMargin={8} width={100} tick={{ fontSize: 9 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" name="Leads" radius={[0, 2, 2, 0]} fill="var(--color-count)" />
              </BarChart>
            </ChartContainer>
          </ChartSection>
        )}

        {data.avgScoreByMonth.some((m) => m.avg != null) && (
          <ChartSection title="Avg lead score over time" sub="Monthly average AI qualification score">
            <ChartContainer config={avgScoreConfig} className="h-[200px] w-full">
              <BarChart data={data.avgScoreByMonth} barSize={22}>
                <CartesianGrid vertical={false} stroke={PAPER_GRID} strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickMargin={8} width={32} tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="avg" name="Avg score" radius={[2, 2, 0, 0]}>
                  {data.avgScoreByMonth.map((entry) => (
                    <Cell
                      key={entry.month}
                      fill={
                        entry.avg == null
                          ? 'hsl(var(--muted-foreground) / 0.2)'
                          : entry.avg >= 75
                            ? 'hsl(var(--foreground))'
                            : entry.avg >= 45
                              ? 'hsl(var(--foreground) / 0.6)'
                              : 'hsl(var(--muted-foreground) / 0.4)'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </ChartSection>
        )}

        {data.buyerBudgetDistribution.length > 0 && (
          <ChartSection title="Buyer budget distribution" sub="Budget ranges across buyer leads">
            <ChartContainer config={buyerBudgetConfig} className="h-[220px] w-full">
              <BarChart data={data.buyerBudgetDistribution} barSize={28}>
                <CartesianGrid vertical={false} stroke={PAPER_GRID} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={32} tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" name="Buyers" radius={[2, 2, 0, 0]}>
                  {data.buyerBudgetDistribution.map((entry) => (
                    <Cell
                      key={entry.label}
                      fill={BUYER_BUDGET_FILLS[entry.label] ?? 'hsl(var(--muted-foreground) / 0.4)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </ChartSection>
        )}
      </div>

      {data.leadStateDistribution.length === 0 && data.employmentBreakdown.length === 0 && (
        <div className="rounded-xl border border-border/70 bg-background px-6 py-12 text-center">
          <p className={BODY_MUTED}>
            Once leads submit full applications, the qualification breakdown shows up here.
          </p>
        </div>
      )}
    </div>
  );
}
