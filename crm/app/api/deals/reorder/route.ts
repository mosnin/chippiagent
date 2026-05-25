import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dealId, newStageId, newPosition } = await req.json();

  if (!dealId || typeof dealId !== 'string') {
    return NextResponse.json({ error: 'dealId is required' }, { status: 400 });
  }
  if (!newStageId || typeof newStageId !== 'string') {
    return NextResponse.json({ error: 'newStageId is required' }, { status: 400 });
  }
  if (typeof newPosition !== 'number' || !Number.isInteger(newPosition) || newPosition < 0) {
    return NextResponse.json({ error: 'newPosition must be a non-negative integer' }, { status: 400 });
  }

  // Verify the deal exists and belongs to this user's space
  const { data: deal, error: dealError } = await supabase
    .from('Deal')
    .select('id, spaceId, stageId, position')
    .eq('id', dealId)
    .maybeSingle();
  if (dealError) throw dealError;
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const space = await getSpaceForUser(userId);
  if (!space || deal.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Verify the target stage belongs to the same space
  const { data: stage, error: stageError } = await supabase
    .from('DealStage')
    .select('id, spaceId')
    .eq('id', newStageId)
    .maybeSingle();
  if (stageError) throw stageError;
  if (!stage || stage.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Atomically shift affected deals and move the deal via a DB function.
  // This replaces the previous N individual updates which had a race condition
  // under concurrent drag-and-drop: two requests could both read the same
  // positions and double-increment them.
  const { error: rpcError } = await supabase.rpc('reorder_deal', {
    p_deal_id: dealId,
    p_new_stage_id: newStageId,
    p_new_position: newPosition,
  });
  if (rpcError) {
    console.error('[deals/reorder] rpc failed', rpcError);
    throw rpcError;
  }

  const { data: updated, error: fetchError } = await supabase
    .from('Deal')
    .select('*')
    .eq('id', dealId)
    .single();
  if (fetchError) throw fetchError;

  return NextResponse.json(updated);
}
