import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50'), 200);
  const agentType = req.nextUrl.searchParams.get('agentType');
  const outcome = req.nextUrl.searchParams.get('outcome');

  let query = supabase
    .from('AgentActivityLog')
    .select(`
      id, runId, agentType, actionType, reasoning, outcome,
      relatedContactId, relatedDealId, reversible, reversedAt, metadata, createdAt,
      Contact:relatedContactId ( id, name ),
      Deal:relatedDealId ( id, title )
    `)
    .eq('spaceId', space.id)
    .order('createdAt', { ascending: false })
    .limit(limit);

  if (agentType) query = query.eq('agentType', agentType);
  if (outcome) query = query.eq('outcome', outcome);

  const { data, error } = await query;
  if (error) throw error;
  return NextResponse.json(data ?? []);
}
