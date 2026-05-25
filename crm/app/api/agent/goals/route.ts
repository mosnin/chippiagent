import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const VALID_GOAL_TYPES = [
  'follow_up_sequence',
  'tour_booking',
  'offer_progress',
  'deal_close',
  'reengagement',
  'custom',
] as const;

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const status = req.nextUrl.searchParams.get('status') ?? 'active';
  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10);
  const limit = Math.min(isNaN(limitParam) ? 20 : limitParam, 50);
  const contactId = req.nextUrl.searchParams.get('contactId');

  let query = supabase
    .from('AgentGoal')
    .select('*, Contact:contactId(id,name)')
    .eq('spaceId', space.id)
    .eq('status', status)
    .order('priority', { ascending: false })
    .order('createdAt', { ascending: false })
    .limit(limit);

  if (contactId) query = query.eq('contactId', contactId);

  const { data, error } = await query;
  if (error) throw error;
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { goalType, description, instructions, contactId, dealId, priority } = body;

  if (!goalType || !(VALID_GOAL_TYPES as readonly string[]).includes(goalType)) {
    return NextResponse.json(
      { error: `goalType must be one of: ${VALID_GOAL_TYPES.join(', ')}` },
      { status: 400 },
    );
  }

  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 });
  }

  // Validate foreign keys belong to this space
  if (contactId) {
    const { data: c } = await supabase.from('Contact').select('id')
      .eq('id', contactId).eq('spaceId', space.id).maybeSingle();
    if (!c) return NextResponse.json({ error: 'Contact not found' }, { status: 400 });
  }
  if (dealId) {
    const { data: d } = await supabase.from('Deal').select('id')
      .eq('id', dealId).eq('spaceId', space.id).maybeSingle();
    if (!d) return NextResponse.json({ error: 'Deal not found' }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('AgentGoal')
    .insert({
      id: crypto.randomUUID(),
      spaceId: space.id,
      goalType,
      description: description.trim(),
      instructions: instructions ?? null,
      contactId: contactId ?? null,
      dealId: dealId ?? null,
      priority: typeof priority === 'number' ? priority : 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .select()
    .single();

  if (error) throw error;
  return NextResponse.json(data, { status: 201 });
}
