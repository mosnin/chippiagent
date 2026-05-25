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
  formatCurrency,
  PAPER_SERIES,
  PAPER_GRID,
} from './chart-primitives';
import type { ChartConfig } from './chart-primitives';
import type { PipelineAnalyticsData } from '@/lib/analytics-data';
import {
  SECTION_RHYTHM,
  STAT_NUMBER,
  TITLE_FONT,
  CAPTION,
  BODY_MUTED,
} from '@/lib/typography';

const dealsByStageCountConfig = {
  count: { label: 'Deals', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

const dealsByStageValueConfig = {
  value: { label: 'Value', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

const dealsOverTimeConfig = {
  count: { label: 'Deals', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

const dealsByPriorityConfig = {
  High: { label: 'High', color: 'hsl(var(--foreground))' },
  Medium: { label: 'Medium', color: 'hsl(var(--foreground) / 0.7)' },
  Low: { label: 'Low', color: 'hsl(var(--muted-foreground) / 0.5)' },
  None: { label: 'None', color: 'hsl(var(--muted-foreground) / 0.25)' },
} satisfies ChartConfig;

// Priority fills — High darkest, None lightest. Ordered emphasis.
const PRIORITY_FILLS: Record<string, string> = {
  High: 'hsl(var(--foreground))',
  Medium: 'hsl(var(--foreground) / 0.7)',
  Low: 'hsl(var(--muted-foreground) / 0.5)',
  None: 'hsl(var(--muted-foreground) / 0.25)',
};

export function PipelineView({ data }: { data: PipelineAnalyticsData }) {
  return (
    <div className={SECTION_RHYTHM}>
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70">
        <StatCell label="Total deals" value={data.totalDeals} />
        <StatCell
          label="Pipeline value"
          value={formatCurrency(data.totalPipelineValue)}
          sub="active deals"
        />
        <StatCell
          label="Avg deal size"
          value={data.activeDeals > 0 ? formatCurrency(data.avgDealSize) : '--'}
          sub="active deals"
        />
        <StatCell
          label="Win rate"
          value={data.wonDeals + data.lostDeals > 0 ? `${data.dealWinRate}%` : '--'}
          sub={`${data.wonDeals} won / ${data.lostDeals} lost`}
        />
      </div>

      {/* Stage distribution */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ChartSection title="Deals per stage" sub="Number of deals in each pipeline stage">
          <ChartContainer config={dealsByStageCountConfig} className="h-[220px] w-full">
            <BarChart data={data.dealsByStage} barSize={22}>
              <CartesianGrid vertical={false} stroke={PAPER_GRID} strokeDasharray="3 3" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={28} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" name="Deals" radius={[2, 2, 0, 0]} fill="var(--color-count)" />
            </BarChart>
          </ChartContainer>
        </ChartSection>

        <ChartSection title="Value per stage" sub="Total deal value per pipeline stage">
          <ChartContainer config={dealsByStageValueConfig} className="h-[220px] w-full">
            <BarChart data={data.dealsByStage} barSize={22}>
              <CartesianGrid vertical={false} stroke={PAPER_GRID} strokeDasharray="3 3" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={48}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCurrency(v)}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" name="Value" radius={[2, 2, 0, 0]} fill="var(--color-value)" />
            </BarChart>
          </ChartContainer>
        </ChartSection>
      </div>

      {/* Trends + priority */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ChartSection title="Deals over time" sub="New deals created each month">
          <ChartContainer config={dealsOverTimeConfig} className="h-[220px] w-full">
            <AreaChart data={data.dealsOverTime}>
              <defs>
                <linearGradient id="dealsGradPipeline" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={PAPER_GRID} strokeDasharray="3 3" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={28} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="count"
                name="Deals"
                stroke="var(--color-count)"
                fill="url(#dealsGradPipeline)"
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ChartContainer>
        </ChartSection>

        {data.dealsByPriority.length > 0 && (
          <ChartSection title="Deals by priority" sub="Distribution across priority levels">
            <ChartContainer config={dealsByPriorityConfig} className="h-[220px] w-full">
              <PieChart>
                <Pie
                  data={data.dealsByPriority}
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
                  {data.dealsByPriority.map((entry, i) => (
                    <Cell
                      key={entry.label}
                      fill={PRIORITY_FILLS[entry.label] ?? PAPER_SERIES[i % PAPER_SERIES.length]}
                    />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent nameKey="label" hideLabel />} />
                <ChartLegend content={<ChartLegendContent nameKey="label" />} />
              </PieChart>
            </ChartContainer>
          </ChartSection>
        )}
      </div>

      {/* Win rate visual */}
      {data.wonDeals + data.lostDeals > 0 && (
        <ChartSection title="Win/Loss breakdown" sub="Deal outcomes at a glance">
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
                  strokeDasharray={`${(data.dealWinRate / 100) * 2 * Math.PI * 52} ${2 * Math.PI * 52}`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={STAT_NUMBER} style={TITLE_FONT}>
                  {data.dealWinRate}%
                </span>
              </div>
            </div>
            <p className={`${CAPTION} mt-3 text-center`}>
              {data.wonDeals} won, {data.lostDeals} lost out of {data.totalDeals} deals
            </p>
          </div>
        </ChartSection>
      )}

      {data.totalDeals === 0 && (
        <div className="rounded-xl border border-border/70 bg-background px-6 py-12 text-center">
          <p className={BODY_MUTED}>
            Add a deal and the pipeline charts show up here.
          </p>
        </div>
      )}
    </div>
  );
}
