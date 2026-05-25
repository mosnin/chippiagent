import { NextResponse } from 'next/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/broker/trends
 * Returns weekly time-series data for the last 8 weeks:
 * - new leads, new contacts, new deals, deal value
 */
export async function GET() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { brokerage } = ctx;

  // Get all member space IDs
  const { data: memberships } = await supabase
    .from('BrokerageMembership')
    .select('userId')
    .eq('brokerageId', brokerage.id);
  const memberUserIds = (memberships ?? []).map((m) => m.userId);

  if (memberUserIds.length === 0) {
    return NextResponse.json({ weeks: [] });
  }

  const { data: spaces } = await supabase
    .from('Space')
    .select('id')
    .in('ownerId', memberUserIds);
  const spaceIds = (spaces ?? []).map((s) => s.id);

  if (spaceIds.length === 0) {
    return NextResponse.json({ weeks: [] });
  }

  // Calculate 8 week boundaries
  const now = new Date();
  const weeks: { start: string; end: string; label: string }[] = [];
  for (let i = 7; i >= 0; i--) {
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - i * 7);
    weekEnd.setHours(23, 59, 59, 999);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);
    weeks.push({
      start: weekStart.toISOString(),
      end: weekEnd.toISOString(),
      label: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    });
  }

  // Query all contacts and deals created in the last 8 weeks
  const eightWeeksAgo = weeks[0].start;

  const [contactsRes, dealsRes] = await Promise.all([
    supabase
      .from('Contact')
      .select('id, tags, scoreLabel, createdAt')
      .in('spaceId', spaceIds)
      .gte('createdAt', eightWeeksAgo)
      .order('createdAt', { ascending: true }),
    supabase
      .from('Deal')
      .select('id, value, status, createdAt')
      .in('spaceId', spaceIds)
      .gte('createdAt', eightWeeksAgo)
      .order('createdAt', { ascending: true }),
  ]);

  const contacts = (contactsRes.data ?? []) as Array<{ id: string; tags: string[]; scoreLabel: string | null; createdAt: string }>;
  const deals = (dealsRes.data ?? []) as Array<{ id: string; value: number | null; status: string; createdAt: string }>;

  // Bucket into weeks
  const result = weeks.map((w) => {
    const weekContacts = contacts.filter((c) => c.createdAt >= w.start && c.createdAt <= w.end);
    const weekDeals = deals.filter((d) => d.createdAt >= w.start && d.createdAt <= w.end);

    return {
      label: w.label,
      leads: weekContacts.filter((c) => c.tags?.includes('new-lead')).length,
      contacts: weekContacts.length,
      hotLeads: weekContacts.filter((c) => c.scoreLabel === 'hot').length,
      deals: weekDeals.length,
      dealValue: weekDeals.reduce((sum, d) => sum + (d.value ?? 0), 0),
    };
  });

  return NextResponse.json({ weeks: result });
}
