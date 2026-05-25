import { requireBroker } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { supabase } from '@/lib/supabase';
import type { Metadata } from 'next';
import { AnalyticsClient, type AgentFunnelData } from './analytics-client';

export const metadata: Metadata = { title: 'Conversion Analytics — Broker Dashboard' };

export default async function BrokerAnalyticsPage() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    redirect('/');
  }

  const { brokerage } = ctx;

  // Fetch all members with their spaces
  const members = await getBrokerageMembers(brokerage.id, { includeSpaceName: true });

  const spaceIds = members.map((m) => m.Space?.id).filter(Boolean) as string[];

  // Fetch contacts grouped by type and deals grouped by status for all spaces
  const [contactsRes, dealsRes] = await Promise.all([
    spaceIds.length > 0
      ? supabase
          .from('Contact')
          .select('id, spaceId, type')
          .in('spaceId', spaceIds)
          .limit(50000)
      : Promise.resolve({ data: [] }),
    spaceIds.length > 0
      ? supabase
          .from('Deal')
          .select('id, spaceId, status, value')
          .in('spaceId', spaceIds)
          .limit(50000)
      : Promise.resolve({ data: [] }),
  ]);

  const contacts = (contactsRes.data ?? []) as { id: string; spaceId: string; type: string }[];
  const deals = (dealsRes.data ?? []) as { id: string; spaceId: string; status: string; value: number | null }[];

  // Build per-space counts
  type SpaceStats = {
    totalLeads: number;
    qualification: number;
    tour: number;
    application: number;
    activeDeals: number;
    wonDeals: number;
    lostDeals: number;
    wonValue: number;
  };

  const statsBySpace: Record<string, SpaceStats> = {};

  for (const c of contacts) {
    if (!statsBySpace[c.spaceId]) {
      statsBySpace[c.spaceId] = { totalLeads: 0, qualification: 0, tour: 0, application: 0, activeDeals: 0, wonDeals: 0, lostDeals: 0, wonValue: 0 };
    }
    const s = statsBySpace[c.spaceId];
    s.totalLeads++;
    const t = (c.type ?? 'QUALIFICATION').toUpperCase();
    if (t === 'QUALIFICATION') s.qualification++;
    else if (t === 'TOUR') s.tour++;
    else if (t === 'APPLICATION') s.application++;
  }

  for (const d of deals) {
    if (!statsBySpace[d.spaceId]) {
      statsBySpace[d.spaceId] = { totalLeads: 0, qualification: 0, tour: 0, application: 0, activeDeals: 0, wonDeals: 0, lostDeals: 0, wonValue: 0 };
    }
    const s = statsBySpace[d.spaceId];
    if (d.status === 'active') s.activeDeals++;
    else if (d.status === 'won') {
      s.wonDeals++;
      s.wonValue += d.value ?? 0;
    }
    else if (d.status === 'lost') s.lostDeals++;
  }

  // Build agent funnel data
  const agentData: AgentFunnelData[] = members
    .filter((m) => m.Space?.id)
    .map((m) => {
      const sid = m.Space?.id ?? '';
      const s = statsBySpace[sid] ?? { totalLeads: 0, qualification: 0, tour: 0, application: 0, activeDeals: 0, wonDeals: 0, lostDeals: 0, wonValue: 0 };
      const totalDeals = s.activeDeals + s.wonDeals + s.lostDeals;

      return {
        userId: m.userId,
        name: m.User?.name ?? m.User?.email ?? 'Unknown',
        email: m.User?.email ?? '',
        role: m.role === 'broker_owner' ? 'Owner' : m.role === 'broker_admin' ? 'Admin' : 'Realtor',
        totalLeads: s.totalLeads,
        qualification: s.qualification,
        tours: s.tour,
        applications: s.application,
        activeDeals: s.activeDeals,
        wonDeals: s.wonDeals,
        lostDeals: s.lostDeals,
        totalDeals,
        wonValue: s.wonValue,
        leadToTour: s.totalLeads > 0 ? Math.round((s.tour / s.totalLeads) * 100) : 0,
        tourToApp: s.tour > 0 ? Math.round((s.application / s.tour) * 100) : 0,
        appToDeal: s.application > 0 ? Math.round((totalDeals / s.application) * 100) : 0,
        overallConversion: s.totalLeads > 0 ? Math.round((s.wonDeals / s.totalLeads) * 100) : 0,
      };
    });

  return (
    <div className="space-y-6 w-full">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Conversion Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Per-agent conversion funnel &middot; {brokerage.name}
        </p>
      </div>

      <AnalyticsClient agents={agentData} />
    </div>
  );
}
