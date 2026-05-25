import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import type { Metadata } from 'next';
import { ResponseTimesClient, type RealtorResponseData, type WaitingLead } from './response-times-client';

export const metadata: Metadata = { title: 'Response Times — Broker Dashboard' };

export default async function BrokerResponseTimesPage() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    redirect('/');
  }

  const { brokerage } = ctx;

  // Get all realtor members with their spaces
  const allMembers = await getBrokerageMembers(brokerage.id, { includeSpaceName: true });
  const members = allMembers.filter((m) => m.role === 'realtor_member');

  const spaceIds = members.map((m) => m.Space?.id).filter(Boolean) as string[];

  // For each space, query contacts with tag 'assigned-by-broker' that HAVE lastContactedAt (responded)
  const { data: contactedRaw } = spaceIds.length > 0
    ? await supabase
        .from('Contact')
        .select('id, spaceId, name, email, createdAt, lastContactedAt')
        .in('spaceId', spaceIds)
        .contains('tags', ['assigned-by-broker'])
        .not('lastContactedAt', 'is', null)
        .limit(5000)
    : { data: [] };

  // Contacts with tag 'assigned-by-broker' that have NOT been contacted yet
  const { data: waitingRaw } = spaceIds.length > 0
    ? await supabase
        .from('Contact')
        .select('id, spaceId, name, email, createdAt')
        .in('spaceId', spaceIds)
        .contains('tags', ['assigned-by-broker'])
        .is('lastContactedAt', null)
        .order('createdAt', { ascending: true })
        .limit(5000)
    : { data: [] };

  // Build realtor lookup
  const spaceToRealtor = new Map<string, { userId: string; name: string; email: string }>();
  for (const m of members) {
    if (m.Space?.id) {
      spaceToRealtor.set(m.Space?.id, {
        userId: m.userId,
        name: m.User?.name ?? m.User?.email ?? 'Unknown',
        email: m.User?.email ?? '',
      });
    }
  }

  // Calculate per-realtor response time stats
  type ContactedRow = {
    id: string;
    spaceId: string;
    name: string;
    email: string | null;
    createdAt: string;
    lastContactedAt: string;
  };

  const realtorStatsMap = new Map<string, {
    name: string;
    email: string;
    responseTimes: number[];
    waitingCount: number;
  }>();

  // Initialize all realtors
  for (const m of members) {
    realtorStatsMap.set(m.userId, {
      name: m.User?.name ?? m.User?.email ?? 'Unknown',
      email: m.User?.email ?? '',
      responseTimes: [],
      waitingCount: 0,
    });
  }

  // Aggregate contacted leads
  for (const c of (contactedRaw ?? []) as ContactedRow[]) {
    const realtor = spaceToRealtor.get(c.spaceId);
    if (!realtor) continue;
    const stats = realtorStatsMap.get(realtor.userId);
    if (!stats) continue;

    const created = new Date(c.createdAt).getTime();
    const contacted = new Date(c.lastContactedAt).getTime();
    const diffMs = contacted - created;
    if (diffMs >= 0) {
      stats.responseTimes.push(diffMs);
    }
  }

  // Build waiting leads list
  type WaitingRow = {
    id: string;
    spaceId: string;
    name: string;
    email: string | null;
    createdAt: string;
  };

  const waitingLeads: WaitingLead[] = [];

  for (const c of (waitingRaw ?? []) as WaitingRow[]) {
    const realtor = spaceToRealtor.get(c.spaceId);
    if (!realtor) continue;

    const stats = realtorStatsMap.get(realtor.userId);
    if (stats) stats.waitingCount += 1;

    const ageMs = Date.now() - new Date(c.createdAt).getTime();
    waitingLeads.push({
      id: c.id,
      name: c.name,
      email: c.email,
      createdAt: c.createdAt,
      ageMs,
      realtorName: realtor.name,
      realtorUserId: realtor.userId,
    });
  }

  // Sort waiting leads by age descending (oldest first)
  waitingLeads.sort((a, b) => b.ageMs - a.ageMs);

  // Build per-realtor data
  const realtorData: RealtorResponseData[] = [];

  for (const [userId, stats] of realtorStatsMap) {
    const times = stats.responseTimes;
    const avgMs = times.length > 0
      ? times.reduce((a, b) => a + b, 0) / times.length
      : null;
    const fastestMs = times.length > 0
      ? Math.min(...times)
      : null;

    realtorData.push({
      userId,
      name: stats.name,
      email: stats.email,
      avgResponseMs: avgMs,
      fastestResponseMs: fastestMs,
      contactedCount: times.length,
      waitingCount: stats.waitingCount,
    });
  }

  // Sort by avg response time (fastest first), nulls last
  realtorData.sort((a, b) => {
    if (a.avgResponseMs === null && b.avgResponseMs === null) return 0;
    if (a.avgResponseMs === null) return 1;
    if (b.avgResponseMs === null) return -1;
    return a.avgResponseMs - b.avgResponseMs;
  });

  // Overall team average
  const allTimes = Array.from(realtorStatsMap.values()).flatMap((s) => s.responseTimes);
  const teamAvgMs = allTimes.length > 0
    ? allTimes.reduce((a, b) => a + b, 0) / allTimes.length
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Response Times</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Track how quickly realtors contact assigned leads &middot; {brokerage.name}
        </p>
      </div>

      <ResponseTimesClient
        realtorData={realtorData}
        waitingLeads={waitingLeads}
        teamAvgMs={teamAvgMs}
        totalContacted={allTimes.length}
        totalWaiting={waitingLeads.length}
      />
    </div>
  );
}
