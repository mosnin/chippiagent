import { NextResponse } from 'next/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';

type Params = { params: Promise<{ userId: string }> };

/**
 * GET /api/broker/realtors/[userId]
 * Returns a realtor's contacts, deals, and stats for the broker drill-down view.
 * Only returns data if the user is a member of the broker's brokerage.
 */
export async function GET(_req: Request, { params }: Params) {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { userId } = await params;

  // Verify this user is a member of the broker's brokerage
  const { data: membership } = await supabase
    .from('BrokerageMembership')
    .select('id, role, createdAt')
    .eq('brokerageId', ctx.brokerage.id)
    .eq('userId', userId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Member not found in this brokerage' }, { status: 404 });
  }

  // Get user + space
  const { data: user } = await supabase
    .from('User')
    .select('id, name, email, onboard')
    .eq('id', userId)
    .maybeSingle();
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { data: space } = await supabase
    .from('Space')
    .select('id, slug, name')
    .eq('ownerId', userId)
    .maybeSingle();

  if (!space) {
    return NextResponse.json({
      user,
      membership,
      space: null,
      contacts: [],
      deals: [],
      stages: [],
    });
  }

  // Get recent contacts (last 50)
  const { data: contacts } = await supabase
    .from('Contact')
    .select('id, name, email, phone, type, tags, leadScore, scoreLabel, followUpAt, createdAt')
    .eq('spaceId', space.id)
    .order('createdAt', { ascending: false })
    .limit(50);

  // Get deals with stages
  const { data: deals } = await supabase
    .from('Deal')
    .select('id, title, value, status, stageId, closeDate, createdAt')
    .eq('spaceId', space.id)
    .order('createdAt', { ascending: false })
    .limit(50);

  const { data: stages } = await supabase
    .from('DealStage')
    .select('id, name, color, position')
    .eq('spaceId', space.id)
    .order('position', { ascending: true });

  return NextResponse.json({
    user,
    membership,
    space,
    contacts: contacts ?? [],
    deals: deals ?? [],
    stages: stages ?? [],
  });
}
