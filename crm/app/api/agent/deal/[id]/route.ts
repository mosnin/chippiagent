/**
 * GET /api/agent/deal/[id]
 *
 * Returns agent intelligence context for a single deal:
 *   - memories (facts + observations stored about this deal)
 *   - recent agent activity log entries for this deal
 *
 * Secured with Clerk auth. Deal must belong to the caller's space.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: dealId } = await params;

  // Verify deal belongs to this space
  const { data: deal, error: dealError } = await supabase
    .from('Deal')
    .select('id, title')
    .eq('id', dealId)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (dealError) throw dealError;
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });

  const [memoriesResult, activityResult] = await Promise.all([
    supabase
      .from('AgentMemory')
      .select('id, memoryType, content, importance, createdAt')
      .eq('spaceId', space.id)
      .eq('entityType', 'deal')
      .eq('entityId', dealId)
      .order('importance', { ascending: false })
      .order('createdAt', { ascending: false })
      .limit(20),

    supabase
      .from('AgentActivityLog')
      .select('id, agentType, action, outcome, summary, dealId, createdAt')
      .eq('spaceId', space.id)
      .eq('dealId', dealId)
      .order('createdAt', { ascending: false })
      .limit(15),
  ]);

  return NextResponse.json({
    dealId,
    memories: memoriesResult.data ?? [],
    activity: activityResult.data ?? [],
  });
}
