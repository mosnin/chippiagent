import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { dealHealth } from '@/lib/deals/health';
import type { Metadata } from 'next';
import {
  PipelineClient,
  type PipelineDeal,
  type StageInfo,
  type RealtorInfo,
  type PipelineSummary,
} from './pipeline-client';

export const metadata: Metadata = { title: 'Pipeline — Broker Dashboard' };

export default async function BrokerPipelinePage() {
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

  // Build space -> realtor lookup
  const spaceToRealtor = new Map<string, { userId: string; name: string }>();
  const realtors: RealtorInfo[] = [];
  for (const m of members) {
    const name = m.User?.name ?? m.User?.email ?? 'Unknown';
    if (m.Space?.id) {
      spaceToRealtor.set(m.Space?.id, { userId: m.userId, name });
    }
    realtors.push({ userId: m.userId, name });
  }

  // Fetch all deals across realtor spaces. The health classifier needs
  // followUpAt / nextAction / nextActionDueAt alongside the card fields,
  // so we pull those here and reuse the same rows for both.
  const { data: dealsRaw } = spaceIds.length > 0
    ? await supabase
        .from('Deal')
        .select('id, spaceId, title, description, value, address, priority, closeDate, stageId, status, createdAt, updatedAt, followUpAt, nextAction, nextActionDueAt')
        .in('spaceId', spaceIds)
        .limit(5000)
    : { data: [] };

  // Fetch all deal stages across realtor spaces
  const { data: stagesRaw } = spaceIds.length > 0
    ? await supabase
        .from('DealStage')
        .select('id, spaceId, name, color, position')
        .in('spaceId', spaceIds)
        .order('position', { ascending: true })
        .limit(1000)
    : { data: [] };

  // Build stage lookup
  const stageMap = new Map<string, { name: string; color: string; position: number }>();
  for (const s of (stagesRaw ?? []) as { id: string; spaceId: string; name: string; color: string; position: number }[]) {
    stageMap.set(s.id, { name: s.name, color: s.color, position: s.position });
  }

  // Deduplicate stage names across spaces for the pipeline chart
  const stageNames = new Map<string, StageInfo>();
  for (const s of (stagesRaw ?? []) as { id: string; name: string; color: string; position: number }[]) {
    if (!stageNames.has(s.name)) {
      stageNames.set(s.name, { name: s.name, color: s.color, position: s.position });
    }
  }
  const stages: StageInfo[] = Array.from(stageNames.values()).sort((a, b) => a.position - b.position);

  // Build deals list
  type DealRow = {
    id: string;
    spaceId: string;
    title: string;
    description: string | null;
    value: number | null;
    address: string | null;
    priority: string;
    closeDate: string | null;
    stageId: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    followUpAt: string | null;
    nextAction: string | null;
    nextActionDueAt: string | null;
  };

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let totalPipelineValue = 0;
  let activeDeals = 0;
  let dealsWonThisMonth = 0;
  let dealsLostThisMonth = 0;
  let atRiskCount = 0;
  let stuckCount = 0;
  // Per-agent risk rollup so the dashboard can surface "Alice has 3 stuck
  // deals" at a glance without the broker pivoting through every card.
  const riskByAgent = new Map<string, { agentName: string; atRisk: number; stuck: number }>();

  const deals: PipelineDeal[] = [];

  for (const d of (dealsRaw ?? []) as DealRow[]) {
    const realtor = spaceToRealtor.get(d.spaceId);
    const stage = stageMap.get(d.stageId);

    // Classify deal health — dealHealth() already returns 'on-track' for
    // non-active deals, so we always call it and let it decide.
    const health = dealHealth({
      status: d.status as 'active' | 'won' | 'lost' | 'on_hold',
      updatedAt: new Date(d.updatedAt),
      closeDate: d.closeDate ? new Date(d.closeDate) : null,
      followUpAt: d.followUpAt ? new Date(d.followUpAt) : null,
      nextAction: d.nextAction,
      nextActionDueAt: d.nextActionDueAt ? new Date(d.nextActionDueAt) : null,
    });

    const deal: PipelineDeal = {
      id: d.id,
      title: d.title,
      value: d.value,
      priority: d.priority as 'LOW' | 'MEDIUM' | 'HIGH',
      closeDate: d.closeDate,
      status: d.status as 'active' | 'won' | 'lost' | 'on_hold',
      stageName: stage?.name ?? 'Unknown',
      stageColor: stage?.color ?? '#888',
      agentName: realtor?.name ?? 'Unknown',
      agentUserId: realtor?.userId ?? '',
      createdAt: d.createdAt,
      health: health.state,
      healthReason: health.reason,
    };

    deals.push(deal);

    // Aggregate summaries
    if (d.status === 'active' || d.status === 'on_hold') {
      totalPipelineValue += d.value ?? 0;
      activeDeals += 1;
    }

    if (health.state === 'at-risk' || health.state === 'stuck') {
      if (health.state === 'at-risk') atRiskCount += 1;
      else stuckCount += 1;
      const key = realtor?.userId ?? 'unknown';
      const row = riskByAgent.get(key) ?? {
        agentName: realtor?.name ?? 'Unknown',
        atRisk: 0,
        stuck: 0,
      };
      if (health.state === 'at-risk') row.atRisk += 1;
      else row.stuck += 1;
      riskByAgent.set(key, row);
    }

    const updatedAt = new Date(d.updatedAt);
    if (d.status === 'won' && updatedAt >= startOfMonth) {
      dealsWonThisMonth += 1;
    }
    if (d.status === 'lost' && updatedAt >= startOfMonth) {
      dealsLostThisMonth += 1;
    }
  }

  const summary: PipelineSummary = {
    totalPipelineValue,
    activeDeals,
    dealsWonThisMonth,
    dealsLostThisMonth,
    atRiskCount,
    stuckCount,
    // Sort descending by stuck then at-risk so the worst agent lands first.
    agentRisk: Array.from(riskByAgent.values()).sort(
      (a, b) => b.stuck - a.stuck || b.atRisk - a.atRisk,
    ),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Team deal pipeline across all realtors &middot; {brokerage.name}
        </p>
      </div>

      <PipelineClient
        deals={deals}
        stages={stages}
        realtors={realtors}
        summary={summary}
      />
    </div>
  );
}
