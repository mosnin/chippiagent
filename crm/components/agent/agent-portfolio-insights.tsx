'use client';

import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Users, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PortfolioData {
  contact_count: number;
  high_score_count: number;
  overdue_followup_count: number;
  rental_pct: number;
  buyer_pct: number;
  pipeline_value: number;
  deals_closing_14d: number;
  avg_lead_score: number;
  engagement_rate_pct: number;
  insights: string[];
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}k`;
  }
  return `$${Math.round(value)}`;
}

function insightColor(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('closing') || lower.includes('priority')) {
    return 'bg-amber-400';
  }
  return 'bg-blue-500';
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2 animate-pulse">
      <div className="h-3 bg-muted rounded w-2/3" />
      <div className="h-6 bg-muted rounded w-1/2" />
      <div className="h-3 bg-muted rounded w-1/3" />
    </div>
  );
}

export function AgentPortfolioInsights() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/agent/portfolio');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch {
        // silently fail — widget is not critical path
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
        <BarChart3 size={14} className="text-primary" />
        <h2 className="text-sm font-semibold">Portfolio Pulse</h2>
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <>
            {/* Skeleton 2x2 grid */}
            <div className="grid grid-cols-2 gap-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
            {/* Skeleton insight rows */}
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="flex items-start gap-2 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-muted mt-0.5 shrink-0" />
                  <div className="h-3.5 bg-muted rounded flex-1" style={{ width: `${60 + i * 10}%` }} />
                </div>
              ))}
            </div>
          </>
        ) : !data ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Portfolio analysis unavailable
          </p>
        ) : (
          <>
            {/* 2x2 Stat grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Pipeline Value */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp size={12} className="text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Pipeline Value</p>
                </div>
                <p className="text-xl font-semibold">{formatCurrency(data.pipeline_value)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">weighted by probability</p>
              </div>

              {/* Hot Leads */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <Users size={12} className="text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Hot Leads</p>
                </div>
                <p
                  className={cn(
                    'text-xl font-semibold',
                    data.high_score_count > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground',
                  )}
                >
                  {data.high_score_count}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">score ≥ 70</p>
              </div>

              {/* Engagement */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <BarChart3 size={12} className="text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Engagement</p>
                </div>
                <p
                  className={cn(
                    'text-xl font-semibold',
                    data.engagement_rate_pct < 30
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-foreground',
                  )}
                >
                  {data.engagement_rate_pct}%
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">contacted in 14d</p>
              </div>

              {/* Closing Soon */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertCircle size={12} className="text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Closing Soon</p>
                </div>
                <p
                  className={cn(
                    'text-xl font-semibold',
                    data.deals_closing_14d > 0 ? 'text-amber-500 dark:text-amber-400' : 'text-muted-foreground',
                  )}
                >
                  {data.deals_closing_14d}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">active deals</p>
              </div>
            </div>

            {/* Insights list */}
            {data.insights.length > 0 && (
              <div className="space-y-2 pt-1">
                {data.insights.map((text, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full mt-0.5 shrink-0',
                        insightColor(text),
                      )}
                    />
                    <p className="text-sm leading-snug text-foreground">{text}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
