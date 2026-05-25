import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: rows, error: fetchError } = await supabase
    .from('Pipeline')
    .select('*')
    .eq('id', id)
    .eq('spaceId', space.id);
  if (fetchError) throw fetchError;
  if (!rows || rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const existing = rows[0];
  const body = await req.json();

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
    }
    if (body.name.trim().length > 100) {
      return NextResponse.json({ error: 'name must be 100 characters or fewer' }, { status: 400 });
    }
    updates.name = body.name.trim();
  }

  if (body.color !== undefined) {
    updates.color = typeof body.color === 'string' && HEX_COLOR.test(body.color)
      ? body.color
      : existing.color;
  }

  if (body.emoji !== undefined) {
    updates.emoji =
      typeof body.emoji === 'string' && body.emoji.trim().length > 0 && body.emoji.trim().length <= 8
        ? body.emoji.trim()
        : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(existing);
  }

  const { data: updated, error: updateError } = await supabase
    .from('Pipeline')
    .update(updates)
    .eq('id', id)
    .eq('spaceId', space.id)
    .select()
    .single();
  if (updateError) throw updateError;

  return NextResponse.json(updated);
}

/**
 * Delete a pipeline with safe stage migration.
 *
 * - If the pipeline has no stages with deals → delete all its stages then delete the pipeline.
 * - If the pipeline has stages with deals and no `targetPipelineId` query param →
 *   respond 400 `{ error: 'pipeline-has-deals', dealCount, stageCount }`.
 * - If `targetPipelineId` is provided → move all stages to the target pipeline,
 *   then delete the now-empty pipeline.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: rows, error: fetchError } = await supabase
    .from('Pipeline')
    .select('*')
    .eq('id', id)
    .eq('spaceId', space.id);
  if (fetchError) throw fetchError;
  if (!rows || rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const rawTarget = req.nextUrl.searchParams.get('targetPipelineId');
  const targetPipelineId =
    typeof rawTarget === 'string' && rawTarget.trim().length > 0 ? rawTarget.trim() : null;

  // Get all stages in this pipeline
  const { data: stages, error: stagesError } = await supabase
    .from('DealStage')
    .select('id')
    .eq('spaceId', space.id)
    .eq('pipelineId', id);
  if (stagesError) throw stagesError;
  const stageIds = (stages ?? []).map((s: { id: string }) => s.id);

  // Count deals across all stages
  let dealCount = 0;
  if (stageIds.length > 0) {
    const { count, error: countError } = await supabase
      .from('Deal')
      .select('id', { count: 'exact', head: true })
      .eq('spaceId', space.id)
      .in('stageId', stageIds);
    if (countError) throw countError;
    dealCount = count ?? 0;
  }

  if (dealCount > 0 && !targetPipelineId) {
    return NextResponse.json(
      { error: 'pipeline-has-deals', dealCount, stageCount: stageIds.length },
      { status: 400 },
    );
  }

  if (dealCount > 0 && targetPipelineId) {
    if (targetPipelineId === id) {
      return NextResponse.json(
        { error: 'targetPipelineId must differ from the pipeline being deleted' },
        { status: 400 },
      );
    }

    // Validate target pipeline belongs to same space
    const { data: targetRows, error: targetError } = await supabase
      .from('Pipeline')
      .select('id')
      .eq('id', targetPipelineId)
      .eq('spaceId', space.id);
    if (targetError) throw targetError;
    if (!targetRows || targetRows.length === 0) {
      return NextResponse.json({ error: 'Target pipeline not found' }, { status: 400 });
    }

    // Move all stages from deleted pipeline to target pipeline
    const { error: moveError } = await supabase
      .from('DealStage')
      .update({ pipelineId: targetPipelineId })
      .eq('spaceId', space.id)
      .eq('pipelineId', id);
    if (moveError) throw moveError;
  } else if (stageIds.length > 0) {
    // No deals — delete all stages first to avoid ON DELETE SET NULL leaving orphans
    const { error: deleteStagesError } = await supabase
      .from('DealStage')
      .delete()
      .eq('spaceId', space.id)
      .eq('pipelineId', id);
    if (deleteStagesError) throw deleteStagesError;
  }

  const { error: deleteError } = await supabase
    .from('Pipeline')
    .delete()
    .eq('id', id)
    .eq('spaceId', space.id);
  if (deleteError) throw deleteError;

  return NextResponse.json({ success: true });
}
