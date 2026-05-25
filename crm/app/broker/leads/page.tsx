import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import type { Metadata } from 'next';
import { H1, TITLE_FONT } from '@/lib/typography';
import { BrokerLeadsClient, type LeadRow, type RealtorOption, type AssignedLeadProgress } from './broker-leads-client';

export const metadata: Metadata = { title: 'Leads — Broker Dashboard' };

export default async function BrokerLeadsPage() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    redirect('/');
  }

  const { brokerage } = ctx;

  // 1. BROKERAGE LEADS — from brokerage intake form
  // Primary path: brokerageId is set.
  const { data: brokerageAllByBrokerageId } = await supabase
    .from('Contact')
    .select('id, name, email, phone, budget, scoreLabel, leadScore, leadType, tags, createdAt, notes, applicationData, applicationStatusNote')
    .eq('brokerageId', brokerage.id)
    .order('createdAt', { ascending: false })
    .limit(500);

  // Legacy compatibility: include brokerage-tagged leads that were saved into
  // the broker owner's space before brokerageId was consistently populated.
  const { data: ownerSpaces } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', brokerage.ownerId)
    .limit(10);
  const ownerSpaceIds = (ownerSpaces ?? []).map((s: { id: string }) => s.id);

  const { data: brokerageUnassignedLegacy } = ownerSpaceIds.length > 0
    ? await supabase
        .from('Contact')
        .select('id, name, email, phone, budget, scoreLabel, leadScore, leadType, tags, createdAt, notes, applicationData, applicationStatusNote')
        .in('spaceId', ownerSpaceIds)
        .is('brokerageId', null)
        .contains('tags', ['brokerage-lead'])
        .order('createdAt', { ascending: false })
        .limit(200)
    : { data: [] };
  const brokerageAll = [
    ...(brokerageAllByBrokerageId ?? []),
    ...((brokerageUnassignedLegacy ?? []).filter(
      (c: any) => !(brokerageAllByBrokerageId ?? []).some((p: any) => p.id === c.id)
    )),
  ];
  const brokerageUnassigned = brokerageAll.filter((c: any) => !(c.tags ?? []).includes('assigned'));
  const brokerageAssigned = brokerageAll.filter((c: any) => (c.tags ?? []).includes('assigned'));

  // 2. MEMBER LEADS — from individual realtor intake forms, visible to admins
  const allMembers = await getBrokerageMembers(brokerage.id, { includeSpaceName: true });
  const memberSpaceIds = allMembers.map((m) => m.Space?.id).filter(Boolean) as string[];

  // Brokerage leads list should only include leads captured via brokerage intake.
  const unassignedRaw = brokerageUnassigned ?? [];

  const assignedRaw = brokerageAssigned ?? [];
  const members = allMembers;

  // Get lead counts per realtor space
  const realtorSpaceIds = members.map((m) => m.Space?.id).filter(Boolean) as string[];
  const { data: leadCounts } = realtorSpaceIds.length > 0
    ? await supabase
        .from('Contact')
        .select('spaceId')
        .in('spaceId', realtorSpaceIds)
        .limit(10000)
    : { data: [] };

  const countBySpace = (leadCounts ?? []).reduce<Record<string, number>>(
    (acc, r: { spaceId: string }) => {
      acc[r.spaceId] = (acc[r.spaceId] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const realtors: RealtorOption[] = members.map((m) => ({
    userId: m.userId,
    name: m.User?.name ?? null,
    email: m.User?.email ?? '',
    spaceId: m.Space?.id ?? null,
    leadCount: m.Space?.id ? (countBySpace[m.Space?.id] ?? 0) : 0,
  }));

  type RawContact = {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    budget: number | null;
    scoreLabel: string | null;
    leadScore: number | null;
    tags: string[];
    createdAt: string;
    notes: string | null;
    applicationData: Record<string, unknown> | null;
    applicationStatusNote?: string | null;
  };

  // Build a map of userId -> realtor name for resolving assignments
  const realtorNameMap = new Map<string, string>();
  for (const m of members) {
    realtorNameMap.set(m.userId, m.User?.name ?? m.User?.email ?? 'Unknown');
  }

  // ── Parse assignment metadata from assigned contacts ──────────────────
  type AssignmentMeta = {
    assignedTo: string;
    assignedToName: string;
    assignedContactId: string;
    assignedSpaceId: string;
    assignedAt: string;
  };

  const assignmentMap = new Map<string, AssignmentMeta>();
  const realtorContactIds: string[] = [];

  for (const c of (assignedRaw ?? []) as RawContact[]) {
    if (c.applicationStatusNote) {
      try {
        const meta = JSON.parse(c.applicationStatusNote) as AssignmentMeta;
        assignmentMap.set(c.id, meta);
        if (meta.assignedContactId) {
          realtorContactIds.push(meta.assignedContactId);
        }
      } catch {
        // Legacy format or invalid JSON — fall back to notes parsing
      }
    }
  }

  // ── Fetch realtor-side contact progress for assigned leads ────────────
  type RealtorContact = {
    id: string;
    type: string;
    leadScore: number | null;
    scoreLabel: string | null;
    followUpAt: string | null;
    lastContactedAt: string | null;
    updatedAt: string;
  };

  const { data: realtorContacts } = realtorContactIds.length > 0
    ? await supabase
        .from('Contact')
        .select('id, type, leadScore, scoreLabel, followUpAt, lastContactedAt, updatedAt')
        .in('id', realtorContactIds)
        .limit(500)
    : { data: [] };

  const realtorContactMap = new Map<string, RealtorContact>();
  for (const rc of (realtorContacts ?? []) as RealtorContact[]) {
    realtorContactMap.set(rc.id, rc);
  }

  // ── Fetch deals linked to realtor-side contacts ───────────────────────
  const { data: dealContactLinks } = realtorContactIds.length > 0
    ? await supabase
        .from('DealContact')
        .select('dealId, contactId')
        .in('contactId', realtorContactIds)
        .limit(500)
    : { data: [] };

  const contactHasDeal = new Set<string>();
  for (const dc of (dealContactLinks ?? []) as { dealId: string; contactId: string }[]) {
    contactHasDeal.add(dc.contactId);
  }

  // ── Build progress map keyed by broker contact ID ─────────────────────
  const progressMap = new Map<string, AssignedLeadProgress>();

  for (const [brokerContactId, meta] of assignmentMap) {
    const rc = realtorContactMap.get(meta.assignedContactId);
    progressMap.set(brokerContactId, {
      realtorName: meta.assignedToName,
      assignedAt: meta.assignedAt,
      assignedContactId: meta.assignedContactId,
      assignedSpaceId: meta.assignedSpaceId,
      currentStage: (rc?.type as AssignedLeadProgress['currentStage']) ?? 'QUALIFICATION',
      currentScore: rc?.leadScore ?? null,
      currentScoreLabel: rc?.scoreLabel ?? null,
      lastActivityAt: rc?.lastContactedAt ?? rc?.updatedAt ?? null,
      hasFollowUp: rc?.followUpAt != null,
      followUpAt: rc?.followUpAt ?? null,
      hasDeal: contactHasDeal.has(meta.assignedContactId),
    });
  }

  function toLeadRow(c: RawContact): LeadRow {
    const moveTiming = c.applicationData?.targetMoveInDate as string | undefined;

    // Try structured metadata first, fall back to notes parsing
    const meta = assignmentMap.get(c.id);
    let assignedName: string | null = null;
    let assignedAt: string | null = null;

    if (meta) {
      assignedName = meta.assignedToName;
      assignedAt = meta.assignedAt;
    } else {
      // Legacy: parse from notes
      const realtorIdMatch = c.notes?.match(/Assigned to realtor \(([^)]+)\)/);
      assignedName = realtorIdMatch?.[1]
        ? realtorNameMap.get(realtorIdMatch[1]) ?? 'Realtor'
        : null;
      const dateMatch = c.notes?.match(/Assigned to realtor .+ on (\S+)/);
      assignedAt = dateMatch?.[1] ?? (c.tags.includes('assigned') ? c.createdAt : null);
    }

    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      budget: c.budget,
      scoreLabel: c.scoreLabel,
      leadScore: c.leadScore,
      leadType: (c as any).leadType ?? 'rental',
      moveTiming: moveTiming ?? null,
      createdAt: c.createdAt,
      assignedTo: assignedName,
      assignedAt,
    };
  }

  const unassignedLeads: LeadRow[] = (unassignedRaw ?? []).map((c: unknown) => toLeadRow(c as RawContact));
  const assignedLeads: LeadRow[] = (assignedRaw ?? []).map((c: unknown) => toLeadRow(c as RawContact));

  // Serialize progress map for client
  const assignedLeadProgress: Record<string, AssignedLeadProgress> = {};
  for (const [id, progress] of progressMap) {
    assignedLeadProgress[id] = progress;
  }

  // ── Page-scoped narration. Pick the loudest fact for THIS page: routing
  // load, hot pipeline waiting on someone, or "caught up." Hand-coded ladder.
  const subtitle = (() => {
    const unassignedCount = unassignedLeads.length;
    if (unassignedCount > 0) {
      return `${unassignedCount} ${unassignedCount === 1 ? 'lead' : 'leads'} landed unassigned. Route ${unassignedCount === 1 ? 'it' : 'them'}.`;
    }
    const hotAssigned = assignedLeads.filter(
      (l) => l.scoreLabel?.toLowerCase() === 'hot',
    ).length;
    if (hotAssigned > 0) {
      return `${hotAssigned} hot ${hotAssigned === 1 ? 'lead' : 'leads'} on a realtor's plate. Check in.`;
    }
    const total = unassignedCount + assignedLeads.length;
    if (total === 0) {
      return 'No leads yet. The intake form is waiting.';
    }
    return `Caught up. ${total} ${total === 1 ? 'lead' : 'leads'} in the brokerage.`;
  })();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className={H1} style={TITLE_FONT}>
          Leads
        </h1>
        <p className="text-lg text-muted-foreground" style={TITLE_FONT}>
          {subtitle}
        </p>
      </header>

      <BrokerLeadsClient
        unassignedLeads={unassignedLeads}
        assignedLeads={assignedLeads}
        realtors={realtors}
        assignedLeadProgress={assignedLeadProgress}
      />
    </div>
  );
}
