import { supabase } from '@/lib/supabase';
import { isPlatformAdmin } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { ScoringHealthClient } from './scoring-health-client';

export const metadata = { title: 'Scoring Health — Admin — Chippi' };

export type SpaceFailureRow = {
  spaceId: string;
  spaceName: string | null;
  spaceSlug: string | null;
  failedCount: number;
};

export type FailedLeadRow = {
  id: string;
  name: string | null;
  spaceId: string;
  spaceSlug: string | null;
  spaceName: string | null;
  createdAt: string;
  scoreSummary: string | null;
};

export default async function ScoringHealthPage() {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect('/');

  const now = new Date();
  const last24hIso = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const last7dIso = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  let totalContacts = 0;
  let totalScored = 0;
  let totalFailed = 0;
  let totalPending = 0;
  let failed24h = 0;
  let failed7d = 0;
  let perSpace: SpaceFailureRow[] = [];
  let recentFailed: FailedLeadRow[] = [];

  try {
    const [
      totalRes,
      scoredRes,
      failedRes,
      pendingRes,
      failed24hRes,
      failed7dRes,
      allFailedSpaces,
      recentFailedRes,
    ] = await Promise.all([
      supabase.from('Contact').select('*', { count: 'exact', head: true }),
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .eq('scoringStatus', 'scored'),
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .eq('scoringStatus', 'failed'),
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .eq('scoringStatus', 'pending'),
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .eq('scoringStatus', 'failed')
        .gte('createdAt', last24hIso),
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .eq('scoringStatus', 'failed')
        .gte('createdAt', last7dIso),
      // Pull all failed spaceIds so we can aggregate top 10
      supabase
        .from('Contact')
        .select('spaceId, Space(slug, name)')
        .eq('scoringStatus', 'failed')
        .limit(5000),
      supabase
        .from('Contact')
        .select('id, name, spaceId, createdAt, scoreSummary, Space(slug, name)')
        .eq('scoringStatus', 'failed')
        .order('createdAt', { ascending: false })
        .limit(50),
    ]);

    totalContacts = totalRes.count ?? 0;
    totalScored = scoredRes.count ?? 0;
    totalFailed = failedRes.count ?? 0;
    totalPending = pendingRes.count ?? 0;
    failed24h = failed24hRes.count ?? 0;
    failed7d = failed7dRes.count ?? 0;

    type FailedSpaceRow = {
      spaceId: string;
      Space: { slug: string | null; name: string | null } | { slug: string | null; name: string | null }[] | null;
    };

    const counts = new Map<string, SpaceFailureRow>();
    for (const row of (allFailedSpaces.data ?? []) as FailedSpaceRow[]) {
      if (!row.spaceId) continue;
      const sp = Array.isArray(row.Space) ? row.Space[0] : row.Space;
      const existing = counts.get(row.spaceId);
      if (existing) {
        existing.failedCount += 1;
      } else {
        counts.set(row.spaceId, {
          spaceId: row.spaceId,
          spaceName: sp?.name ?? null,
          spaceSlug: sp?.slug ?? null,
          failedCount: 1,
        });
      }
    }
    perSpace = Array.from(counts.values())
      .sort((a, b) => b.failedCount - a.failedCount)
      .slice(0, 10);

    type RecentFailedRow = {
      id: string;
      name: string | null;
      spaceId: string;
      createdAt: string;
      scoreSummary: string | null;
      Space: { slug: string | null; name: string | null } | { slug: string | null; name: string | null }[] | null;
    };

    recentFailed = ((recentFailedRes.data ?? []) as RecentFailedRow[]).map((r) => {
      const sp = Array.isArray(r.Space) ? r.Space[0] : r.Space;
      return {
        id: r.id,
        name: r.name,
        spaceId: r.spaceId,
        createdAt: r.createdAt,
        scoreSummary: r.scoreSummary,
        spaceSlug: sp?.slug ?? null,
        spaceName: sp?.name ?? null,
      };
    });
  } catch (err) {
    console.error('[admin/scoring-health] query failed', err);
  }

  return (
    <ScoringHealthClient
      stats={{
        totalContacts,
        totalScored,
        totalFailed,
        totalPending,
        failed24h,
        failed7d,
      }}
      perSpace={perSpace}
      failedLeads={recentFailed}
    />
  );
}
