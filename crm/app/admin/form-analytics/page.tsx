import { supabase } from '@/lib/supabase';
import { isPlatformAdmin } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { FormAnalyticsClient } from './form-analytics-client';

export const metadata = { title: 'Form Analytics — Admin — Chippi' };

export type ScoreDistribution = {
  hot: number;
  warm: number;
  cold: number;
  unqualified: number;
};

export type BrokerageSubmissionRow = {
  brokerageId: string;
  brokerageName: string | null;
  count: number;
};

export type SpaceSubmissionRow = {
  spaceId: string;
  spaceName: string | null;
  spaceSlug: string | null;
  count: number;
};

export type SourceRow = { source: string; count: number };
export type TrendPoint = { date: string; count: number };

const FORM_TAGS = ['application-link', 'brokerage-lead'];

export default async function FormAnalyticsPage() {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect('/');

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  let totalSubmissions = 0;
  let submissions7d = 0;
  let submissions30d = 0;
  let avgScore = 0;
  let distribution: ScoreDistribution = { hot: 0, warm: 0, cold: 0, unqualified: 0 };
  let emptyApplications = 0;
  let topBrokerages: BrokerageSubmissionRow[] = [];
  let topSpaces: SpaceSubmissionRow[] = [];
  let trend: TrendPoint[] = [];
  let perSource: SourceRow[] = [];

  try {
    const [
      totalRes,
      sevenRes,
      thirtyRes,
      scoreRowsRes,
      distRes,
      emptyRes,
      brokerageRowsRes,
      spaceRowsRes,
      trendRowsRes,
      sourceRowsRes,
    ] = await Promise.all([
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .overlaps('tags', FORM_TAGS),
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .overlaps('tags', FORM_TAGS)
        .gte('createdAt', sevenDaysAgo),
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .overlaps('tags', FORM_TAGS)
        .gte('createdAt', thirtyDaysAgo),
      supabase
        .from('Contact')
        .select('leadScore')
        .overlaps('tags', FORM_TAGS)
        .not('leadScore', 'is', null)
        .limit(5000),
      supabase
        .from('Contact')
        .select('scoreLabel')
        .overlaps('tags', FORM_TAGS)
        .not('scoreLabel', 'is', null)
        .limit(5000),
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .overlaps('tags', FORM_TAGS)
        .is('applicationData', null),
      supabase
        .from('Contact')
        .select('brokerageId')
        .overlaps('tags', FORM_TAGS)
        .not('brokerageId', 'is', null)
        .limit(5000),
      supabase
        .from('Contact')
        .select('spaceId, Space(slug, name)')
        .overlaps('tags', FORM_TAGS)
        .limit(5000),
      supabase
        .from('Contact')
        .select('createdAt')
        .overlaps('tags', FORM_TAGS)
        .gte('createdAt', thirtyDaysAgo)
        .order('createdAt', { ascending: true }),
      supabase
        .from('Contact')
        .select('sourceLabel')
        .overlaps('tags', FORM_TAGS)
        .limit(5000),
    ]);

    totalSubmissions = totalRes.count ?? 0;
    submissions7d = sevenRes.count ?? 0;
    submissions30d = thirtyRes.count ?? 0;
    emptyApplications = emptyRes.count ?? 0;

    const scoreRows = (scoreRowsRes.data ?? []) as { leadScore: number | null }[];
    if (scoreRows.length > 0) {
      const sum = scoreRows.reduce((a, r) => a + (r.leadScore ?? 0), 0);
      avgScore = Math.round((sum / scoreRows.length) * 10) / 10;
    }

    for (const row of (distRes.data ?? []) as { scoreLabel: string | null }[]) {
      const label = (row.scoreLabel ?? '').toLowerCase();
      if (label === 'hot') distribution.hot++;
      else if (label === 'warm') distribution.warm++;
      else if (label === 'cold') distribution.cold++;
      else if (label === 'unqualified') distribution.unqualified++;
    }

    // Top brokerages
    const brokerageCounts = new Map<string, number>();
    for (const r of (brokerageRowsRes.data ?? []) as { brokerageId: string | null }[]) {
      if (!r.brokerageId) continue;
      brokerageCounts.set(r.brokerageId, (brokerageCounts.get(r.brokerageId) ?? 0) + 1);
    }
    const topBrokerageIds = Array.from(brokerageCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (topBrokerageIds.length > 0) {
      const ids = topBrokerageIds.map(([id]) => id);
      const { data: brokerageNames } = await supabase
        .from('Brokerage')
        .select('id, name')
        .in('id', ids);
      const nameById = new Map<string, string>();
      for (const b of (brokerageNames ?? []) as { id: string; name: string | null }[]) {
        if (b.name) nameById.set(b.id, b.name);
      }
      topBrokerages = topBrokerageIds.map(([id, count]) => ({
        brokerageId: id,
        brokerageName: nameById.get(id) ?? null,
        count,
      }));
    }

    // Top spaces
    type SpaceRow = {
      spaceId: string;
      Space: { slug: string | null; name: string | null } | { slug: string | null; name: string | null }[] | null;
    };
    const spaceCounts = new Map<string, SpaceSubmissionRow>();
    for (const r of (spaceRowsRes.data ?? []) as SpaceRow[]) {
      if (!r.spaceId) continue;
      const sp = Array.isArray(r.Space) ? r.Space[0] : r.Space;
      const existing = spaceCounts.get(r.spaceId);
      if (existing) {
        existing.count += 1;
      } else {
        spaceCounts.set(r.spaceId, {
          spaceId: r.spaceId,
          spaceName: sp?.name ?? null,
          spaceSlug: sp?.slug ?? null,
          count: 1,
        });
      }
    }
    topSpaces = Array.from(spaceCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Trend (30-day, per-day)
    const dayMap: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86_400_000);
      dayMap[d.toISOString().slice(0, 10)] = 0;
    }
    for (const row of (trendRowsRes.data ?? []) as { createdAt: string }[]) {
      const day = new Date(row.createdAt).toISOString().slice(0, 10);
      if (day in dayMap) dayMap[day]++;
    }
    trend = Object.entries(dayMap).map(([date, count]) => ({ date, count }));

    // Source funnel
    const srcCounts = new Map<string, number>();
    for (const r of (sourceRowsRes.data ?? []) as { sourceLabel: string | null }[]) {
      const key = r.sourceLabel || 'unknown';
      srcCounts.set(key, (srcCounts.get(key) ?? 0) + 1);
    }
    perSource = Array.from(srcCounts.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);
  } catch (err) {
    console.error('[admin/form-analytics] query failed', err);
  }

  return (
    <FormAnalyticsClient
      stats={{
        totalSubmissions,
        submissions7d,
        submissions30d,
        avgScore,
        emptyApplications,
      }}
      distribution={distribution}
      topBrokerages={topBrokerages}
      topSpaces={topSpaces}
      trend={trend}
      perSource={perSource}
    />
  );
}
