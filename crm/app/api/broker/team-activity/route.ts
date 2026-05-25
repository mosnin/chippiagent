import { NextResponse } from 'next/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';

interface ActivityItem {
  id: string;
  type: 'lead' | 'deal' | 'tour';
  actor: string;
  action: string;
  entity: string;
  timestamp: string;
}

/**
 * GET /api/broker/team-activity
 * Returns the 10 most recent activities (new leads, deals, tours)
 * across all brokerage member workspaces, merged and time-sorted.
 */
export async function GET() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { brokerage } = ctx;

  // Get all member user IDs
  const { data: memberships } = await supabase
    .from('BrokerageMembership')
    .select('userId')
    .eq('brokerageId', brokerage.id);
  const memberUserIds = (memberships ?? []).map((m) => m.userId);

  if (memberUserIds.length === 0) {
    return NextResponse.json({ activities: [] });
  }

  // Get spaces owned by members, with owner name
  const { data: spaces } = await supabase
    .from('Space')
    .select('id, ownerId')
    .in('ownerId', memberUserIds);

  if (!spaces || spaces.length === 0) {
    return NextResponse.json({ activities: [] });
  }

  const spaceIds = spaces.map((s) => s.id);
  const ownerIds = [...new Set(spaces.map((s) => s.ownerId))];

  // Fetch user names for actors
  const { data: users } = await supabase
    .from('User')
    .select('id, name')
    .in('id', ownerIds);
  const userMap = new Map((users ?? []).map((u) => [u.id, u.name ?? 'Unknown']));
  const spaceOwnerMap = new Map(spaces.map((s) => [s.id, s.ownerId]));

  function actorForSpace(spaceId: string): string {
    const ownerId = spaceOwnerMap.get(spaceId);
    return ownerId ? (userMap.get(ownerId) ?? 'Unknown') : 'Unknown';
  }

  // Fetch recent leads, deals, and tours in parallel
  const [leadsRes, dealsRes, toursRes] = await Promise.all([
    supabase
      .from('Contact')
      .select('id, name, spaceId, createdAt')
      .in('spaceId', spaceIds)
      .contains('tags', ['new-lead'])
      .order('createdAt', { ascending: false })
      .limit(10),
    supabase
      .from('Deal')
      .select('id, title, spaceId, createdAt')
      .in('spaceId', spaceIds)
      .order('createdAt', { ascending: false })
      .limit(10),
    supabase
      .from('Tour')
      .select('id, guestName, spaceId, createdAt')
      .in('spaceId', spaceIds)
      .order('createdAt', { ascending: false })
      .limit(10),
  ]);

  if (leadsRes.error) console.error('[broker/activity] leads query failed:', leadsRes.error);
  if (dealsRes.error) console.error('[broker/activity] deals query failed:', dealsRes.error);
  if (toursRes.error) console.error('[broker/activity] tours query failed:', toursRes.error);

  const activities: ActivityItem[] = [];

  for (const lead of leadsRes.data ?? []) {
    activities.push({
      id: `lead-${lead.id}`,
      type: 'lead',
      actor: actorForSpace(lead.spaceId),
      action: 'received a new lead',
      entity: lead.name ?? 'Unnamed',
      timestamp: lead.createdAt,
    });
  }

  for (const deal of dealsRes.data ?? []) {
    activities.push({
      id: `deal-${deal.id}`,
      type: 'deal',
      actor: actorForSpace(deal.spaceId),
      action: 'created a deal',
      entity: deal.title ?? 'Untitled',
      timestamp: deal.createdAt,
    });
  }

  for (const tour of toursRes.data ?? []) {
    activities.push({
      id: `tour-${tour.id}`,
      type: 'tour',
      actor: actorForSpace(tour.spaceId),
      action: 'scheduled a tour',
      entity: tour.guestName ?? 'Unknown guest',
      timestamp: tour.createdAt,
    });
  }

  // Sort by timestamp descending and take top 10
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return NextResponse.json({ activities: activities.slice(0, 10) });
}
