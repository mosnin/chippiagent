'use client';

import {
  AreaChart,
  Area,
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
import type { ToursAnalyticsData } from '@/lib/analytics-data';
import {
  SECTION_RHYTHM,
  STAT_NUMBER,
  TITLE_FONT,
  CAPTION,
  H3,
  BODY_MUTED,
} from '@/lib/typography';

const toursOverTimeConfig = {
  count: { label: 'Tours', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

const toursByStatusConfig = {
  Completed: { label: 'Completed', color: 'hsl(var(--foreground))' },
  Scheduled: { label: 'Scheduled', color: 'hsl(var(--foreground) / 0.7)' },
  Confirmed: { label: 'Confirmed', color: 'hsl(var(--foreground) / 0.55)' },
  Cancelled: { label: 'Cancelled', color: 'hsl(var(--muted-foreground) / 0.4)' },
  'No-show': { label: 'No-show', color: 'hsl(var(--muted-foreground) / 0.55)' },
  Pending: { label: 'Pending', color: 'hsl(var(--muted-foreground) / 0.25)' },
} satisfies ChartConfig;

// Status fills — outcome-ordered: Completed darkest (success), Cancelled lightest.
const STATUS_FILLS: Record<string, string> = {
  Completed: 'hsl(var(--foreground))',
  Scheduled: 'hsl(var(--foreground) / 0.7)',
  Confirmed: 'hsl(var(--foreground) / 0.55)',
  'No-show': 'hsl(var(--muted-foreground) / 0.55)',
  Cancelled: 'hsl(var(--muted-foreground) / 0.4)',
  Pending: 'hsl(var(--muted-foreground) / 0.25)',
};

export function ToursView({ data }: { data: ToursAnalyticsData }) {
  return (
    <div className={SECTION_RHYTHM}>
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70">
        <StatCell label="Total tours" value={data.totalTours} sub="all time" />
        <StatCell label="Completed" value={data.completedTours} sub="tours finished" />
        <StatCell
          label="Cancelled / No-show"
          value={data.cancelledTours + data.noShowTours}
          sub={`${data.noShowTours} no-show`}
        />
        <StatCell
          label="Tour-to-deal rate"
          value={data.completedTours > 0 ? `${data.tourConversionRate}%` : '--'}
          sub={`${data.toursConvertedToDeals} converted`}
        />
      </div>

      {/* Charts */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ChartSection title="Tours over time" sub="Tour bookings per month">
          <ChartContainer config={toursOverTimeConfig} className="h-[220px] w-full">
            <AreaChart data={data.toursOverTime}>
              <defs>
                <linearGradient id="toursGrad" x1="0" y1="0" x2="0" y2="1">
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
                name="Tours"
                stroke="var(--color-count)"
                fill="url(#toursGrad)"
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ChartContainer>
        </ChartSection>

        <ChartSection title="Tours by status" sub="Breakdown of tour outcomes">
          {data.toursByStatus.length > 0 ? (
            <ChartContainer config={toursByStatusConfig} className="h-[220px] w-full">
              <PieChart>
                <Pie
                  data={data.toursByStatus}
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
                  {data.toursByStatus.map((entry, i) => (
                    <Cell
                      key={entry.label}
                      fill={STATUS_FILLS[entry.label] ?? PAPER_SERIES[i % PAPER_SERIES.length]}
                    />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent nameKey="label" hideLabel />} />
                <ChartLegend content={<ChartLegendContent nameKey="label" />} />
              </PieChart>
            </ChartContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
              No tour data yet.
            </div>
          )}
        </ChartSection>
      </div>

      {/* Conversion funnel */}
      <ChartSection title="Tour conversion funnel" sub="From booked tours to closed deals">
        <div className="flex flex-col sm:flex-row gap-4 items-stretch py-2">
          {[
            { label: 'Booked', count: data.totalTours },
            { label: 'Completed', count: data.completedTours },
            { label: 'Converted to deal', count: data.toursConvertedToDeals },
          ].map((stage, i) => {
            const opacity = 1 - i * 0.15;
            const pct =
              data.totalTours > 0 && i > 0
                ? Math.round((stage.count / data.totalTours) * 100)
                : null;
            return (
              <div
                key={stage.label}
                className="flex-1 rounded-xl border border-border/70 bg-background px-5 py-4 flex sm:flex-col items-center sm:items-start gap-3 sm:gap-1"
              >
                <p
                  className={STAT_NUMBER}
                  style={{ ...TITLE_FONT, opacity }}
                >
                  {stage.count}
                </p>
                <div className="flex flex-col">
                  <p className={H3}>{stage.label}</p>
                  {pct != null && (
                    <p className={CAPTION}>{pct}% of booked</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ChartSection>

      {data.totalTours === 0 && (
        <div className="rounded-xl border border-border/70 bg-background px-6 py-12 text-center">
          <p className={BODY_MUTED}>
            Tour analytics will appear here once tours are scheduled and completed.
          </p>
        </div>
      )}
    </div>
  );
}
