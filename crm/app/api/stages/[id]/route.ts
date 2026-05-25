import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { audit } from '@/lib/audit';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;

  const space = await getSpaceForUser(userId);
  if (!space) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('DealStage')
    .select('*')
    .eq('id', id)
    .eq('spaceId', space.id);
  if (existingError) throw existingError;
  if (!existingRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const existing = existingRows[0];

  const body = await req.json();

  // Validate name
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
    }
    if (body.name.length > 100) {
      return NextResponse.json({ error: 'name must be 100 characters or fewer' }, { status: 400 });
    }
  }

  // Validate color is a safe 6-digit hex code
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;
  const safeColor = typeof body.color === 'string' && HEX_COLOR.test(body.color)
    ? body.color
    : existing.color; // keep existing color if invalid value supplied

  // Optional stage kind. null explicitly clears; an invalid value is rejected.
  const VALID_KINDS = ['lead', 'qualified', 'active', 'under_contract', 'closing', 'closed'] as const;
  let kindUpdate: string | null | undefined = undefined;
  if (body.kind !== undefined) {
    if (body.kind === null) kindUpdate = null;
    else if (typeof body.kind === 'string' && (VALID_KINDS as readonly string[]).includes(body.kind)) kindUpdate = body.kind;
    else return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
  }

  const { data: stage, error: updateError } = await supabase
    .from('DealStage')
    .update({
      name: body.name !== undefined ? body.name.trim() : existing.name,
      color: safeColor,
      ...(kindUpdate !== undefined && { kind: kindUpdate }),
    })
    .eq('id', id)
    .eq('spaceId', space.id)
    .select()
    .single();
  if (updateError) throw updateError;

  void audit({
    actorClerkId: userId,
    action: 'UPDATE',
    resource: 'DealStage',
    resourceId: id,
    spaceId: space.id,
  });

  return NextResponse.json(stage);
}

/**
 * Safe stage deletion with optional deal migration.
 *
 * The Deal.stageId FK is ON DELETE CASCADE (see supabase/setup.sql), so a
 * naive delete would destroy every deal in the stage. This handler prevents
 * that:
 *
 *   - If the stage has no deals -> delete it.
 *   - If the stage has deals and no `targetStageId` query param is provided,
 *     respond with 400 `{ error: 'stage-has-deals', dealCount }` so the UI
 *     can prompt the user to pick a migration target.
 *   - If `targetStageId` is provided, validate it belongs to the same space
 *     and pipelineType (and isn't the stage being deleted), reassign the
 *     deals, then delete the stage.
 *
 * Transactionality note:
 *   Supabase's PostgREST client does not expose a single multi-statement
 *   transaction for arbitrary UPDATE + DELETE pairs from the JS client, and
 *   we don't have an RPC for this flow. We therefore issue the UPDATE first
 *   and only proceed to the DELETE if it succeeds. If the UPDATE fails, no
 *   state has changed and we return 500. If the DELETE fails after a
 *   successful UPDATE, deals have already been safely migrated to the target
 *   stage (they're not orphaned or lost) — the old stage simply remains,
 *   and the user can retry. This "best effort, safe partial state" ordering
 *   is preferred over the alternative (delete first, migrate second) which
 *   would risk cascade-deleting deals on a partial failure.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;

  const space = await getSpaceForUser(userId);
  if (!space) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // targetStageId is taken from the query string (e.g. ?targetStageId=...).
  // Normalise whitespace-only / empty values to null so we treat them the
  // same as "no target supplied" rather than issuing a DB lookup for a bad id.
  const rawTargetStageId = req.nextUrl.searchParams.get('targetStageId');
  const targetStageId =
    typeof rawTargetStageId === 'string' && rawTargetStageId.trim().length > 0
      ? rawTargetStageId.trim()
      : null;

  const { data: existingRows, error: existingError } = await supabase
    .from('DealStage')
    .select('*')
    .eq('id', id)
    .eq('spaceId', space.id);
  if (existingError) throw existingError;
  if (!existingRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const stage = existingRows[0];

  // Count deals currently assigned to this stage within the space.
  // We intentionally fail closed if the count comes back null/undefined: a
  // missing count must not be coerced to zero, because that would let the
  // subsequent DELETE cascade through and destroy any deals in the stage.
  const { count: dealCount, error: countError } = await supabase
    .from('Deal')
    .select('id', { count: 'exact', head: true })
    .eq('spaceId', space.id)
    .eq('stageId', id);
  if (countError) throw countError;
  if (dealCount === null || dealCount === undefined) {
    return NextResponse.json(
      { error: 'Could not determine deal count for stage' },
      { status: 500 },
    );
  }

  const hasDeals = dealCount > 0;

  if (hasDeals && !targetStageId) {
    return NextResponse.json(
      { error: 'stage-has-deals', dealCount },
      { status: 400 },
    );
  }

  if (hasDeals && targetStageId) {
    if (targetStageId === id) {
      return NextResponse.json(
        { error: 'targetStageId must differ from the stage being deleted' },
        { status: 400 },
      );
    }

    // Validate target stage: must exist, same space, same pipeline.
    const { data: targetRows, error: targetError } = await supabase
      .from('DealStage')
      .select('id, spaceId, pipelineType, pipelineId')
      .eq('id', targetStageId)
      .eq('spaceId', space.id);
    if (targetError) throw targetError;
    if (!targetRows.length) {
      return NextResponse.json({ error: 'Target stage not found' }, { status: 400 });
    }
    const target = targetRows[0];
    // Prefer pipelineId comparison when available; fall back to pipelineType for legacy stages.
    const sameGroup = stage.pipelineId && target.pipelineId
      ? target.pipelineId === stage.pipelineId
      : target.pipelineType === stage.pipelineType;
    if (!sameGroup) {
      return NextResponse.json(
        { error: 'Target stage must belong to the same pipeline' },
        { status: 400 },
      );
    }

    // Migrate deals first. If this fails, no state has changed.
    const { error: migrateError } = await supabase
      .from('Deal')
      .update({ stageId: targetStageId })
      .eq('spaceId', space.id)
      .eq('stageId', id);
    if (migrateError) throw migrateError;
  }

  const { error: deleteError } = await supabase
    .from('DealStage')
    .delete()
    .eq('id', id)
    .eq('spaceId', space.id);
  if (deleteError) throw deleteError;

  void audit({
    actorClerkId: userId,
    action: 'DELETE',
    resource: 'DealStage',
    resourceId: id,
    spaceId: space.id,
    metadata: hasDeals
      ? { migratedDealCount: dealCount, targetStageId }
      : undefined,
  });

  return NextResponse.json({ success: true });
}
