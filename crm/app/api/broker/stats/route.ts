import { NextResponse } from 'next/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/broker/stats
 * Aggregate counts across all member workspaces for the broker dashboard.
 */
export async function GET() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { brokerage } = ctx;

  // Get all member user ids in this brokerage
  const { data: memberships } = await supabase
    .from('BrokerageMembership')
    .select('userId')
    .eq('brokerageId', brokerage.id);
  const memberUserIds = (memberships ?? []).map((m) => m.userId);

  if (memberUserIds.length === 0) {
    return NextResponse.json({ memberCount: 0, totalLeads: 0, totalApplications: 0, pendingInvites: 0 });
  }

  // Get spaces owned by members
  const { data: spaces } = await supabase
    .from('Space')
    .select('id')
    .in('ownerId', memberUserIds);
  const spaceIds = (spaces ?? []).map((s) => s.id);

  // Count leads (new-lead tag) and applications across all member spaces
  const [leadsRes, appsRes, pendingRes] = await Promise.all([
    spaceIds.length > 0
      ? supabase
          .from('Contact')
          .select('*', { count: 'exact', head: true })
          .in('spaceId', spaceIds)
          .contains('tags', ['new-lead'])
      : { count: 0, error: null },
    spaceIds.length > 0
      ? supabase
          .from('Contact')
          .select('*', { count: 'exact', head: true })
          .in('spaceId', spaceIds)
          .contains('tags', ['application-link'])
      : { count: 0, error: null },
    supabase
      .from('Invitation')
      .select('*', { count: 'exact', head: true })
      .eq('brokerageId', brokerage.id)
      .eq('status', 'pending'),
  ]);

  return NextResponse.json({
    memberCount: memberUserIds.length,
    totalLeads: leadsRes.count ?? 0,
    totalApplications: appsRes.count ?? 0,
    pendingInvites: pendingRes.count ?? 0,
  });
}
