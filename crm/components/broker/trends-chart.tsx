'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';

interface WeekData {
  label: string;
  leads: number;
  contacts: number;
  hotLeads: number;
  deals: number;
  dealValue: number;
}

type Metric = 'leads' | 'contacts' | 'deals' | 'dealValue';

const METRIC_LABELS: Record<Metric, string> = {
  leads: 'New people',
  contacts: 'Total people',
  deals: 'Deals',
  dealValue: 'Deal Value',
};

export function TrendsChart() {
  const [weeks, setWeeks] = useState<WeekData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [metric, setMetric] = useState<Metric>('leads');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/broker/trends', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setWeeks(d.weeks ?? []))
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.error('[trends] Failed to load:', err);
          setError(true);
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="px-5 py-5">
          <div className="h-[200px] bg-muted/30 animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (error || weeks.length === 0) {
    return (
      <Card>
        <CardContent className="px-5 py-5 text-center">
          <p className="text-sm text-muted-foreground">
            {error ? 'Failed to load trends data.' : 'Not enough data for trends yet.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const values = weeks.map((w) => w[metric]);
  const maxVal = Math.max(...values, 1);

  // Calculate trend
  const recentHalf = values.slice(Math.floor(values.length / 2));
  const olderHalf = values.slice(0, Math.floor(values.length / 2));
  const recentAvg = recentHalf.reduce((a, b) => a + b, 0) / (recentHalf.length || 1);
  const olderAvg = olderHalf.reduce((a, b) => a + b, 0) / (olderHalf.length || 1);
  const trendPct = olderAvg > 0 ? Math.round(((recentAvg - olderAvg) / olderAvg) * 100) : 0;

  const formatVal = (v: number) =>
    metric === 'dealValue'
      ? v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
      : String(v);

  return (
    <Card>
      <CardContent className="px-5 py-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} className="text-primary" />
            <p className="text-sm font-semibold">Weekly Trends</p>
            {trendPct !== 0 && (
              <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
                trendPct > 0
                  ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15'
                  : 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/15'
              }`}>
                {trendPct > 0 ? '+' : ''}{trendPct}%
              </span>
            )}
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
            {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`px-2.5 py-1 transition-colors ${
                  metric === m
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {METRIC_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        {/* Bar chart */}
        <div className="flex items-end gap-1.5 h-[140px]">
          {weeks.map((w, i) => {
            const height = maxVal > 0 ? Math.max((values[i] / maxVal) * 100, 4) : 4;
            return (
              <div key={w.label} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                  {formatVal(values[i])}
                </span>
                <div className="w-full flex items-end" style={{ height: '100px' }}>
                  <div
                    className="w-full rounded-t-sm bg-primary/70 hover:bg-primary transition-colors"
                    style={{ height: `${height}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium">{w.label}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
