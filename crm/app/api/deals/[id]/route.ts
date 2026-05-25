import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { syncDeal, deleteDealVector } from '@/lib/vectorize';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { audit } from '@/lib/audit';
import { fireAgentTrigger } from '@/lib/agent/fire-trigger';
import type { Deal, DealStage } from '@/lib/types';

async function resolveDealAndSpace(userId: string, dealId: string) {
  const space = await getSpaceForUser(userId);
  if (!space) return null;
  const { data: rows, error } = await supabase
    .from('Deal')
    .select('*')
    .eq('id', dealId)
    .eq('spaceId', space.id);
  if (error) throw error;
  if (!rows.length) return null;
  return { deal: rows[0], space };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const ctx = await resolveDealAndSpace(userId, id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { deal } = ctx;

  const [stageResult, dcResult, activityResult] = await Promise.all([
    supabase.from('DealStage').select('*').eq('id', deal.stageId).maybeSingle(),
    supabase.from('DealContact').select('dealId, contactId, role, Contact(id, name, type)').eq('dealId', id),
    supabase.from('DealActivity').select('*').eq('dealId', id).eq('spaceId', ctx.space.id).order('createdAt', { ascending: false }).limit(50),
  ]);

  if (stageResult.error && stageResult.error.code !== 'PGRST116') throw stageResult.error;
  if (dcResult.error) throw dcResult.error;

  const dealContacts = (dcResult.data ?? []).map((row: any) => ({
    dealId: row.dealId,
    contactId: row.contactId,
    role: row.role ?? null,
    contact: row.Contact ? { id: row.Contact.id, name: row.Contact.name, type: row.Contact.type } : null,
  }));

  return NextResponse.json({
    ...deal,
    stage: stageResult.data ?? null,
    dealContacts,
    activities: activityResult.data ?? [],
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const { id } = await params;

    const space = await getSpaceForUser(userId);
    if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: existingRows, error: existingError } = await supabase
      .from('Deal')
      .select('*')
      .eq('id', id)
      .eq('spaceId', space.id);
    if (existingError) {
      console.error('[deals/PATCH] fetch error:', existingError);
      return NextResponse.json({ error: 'Failed to fetch deal' }, { status: 500 });
    }
    if (!existingRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const existing = existingRows[0];

    const body = await req.json();

    const VALID_STATUSES = ['active', 'won', 'lost', 'on_hold'];
    if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Validate milestones
    let milestonesVal: import('@/lib/types').DealMilestone[] | undefined = undefined;
    if (body.milestones !== undefined) {
      if (!Array.isArray(body.milestones)) {
        return NextResponse.json({ error: 'milestones must be an array' }, { status: 400 });
      }
      const truncated = (body.milestones as unknown[]).slice(0, 20);
      for (const item of truncated) {
        if (typeof item !== 'object' || item === null) {
          return NextResponse.json({ error: 'Each milestone must be an object' }, { status: 400 });
        }
        const m = item as Record<string, unknown>;
        if (typeof m.id !== 'string') {
          return NextResponse.json({ error: 'Milestone id must be a string' }, { status: 400 });
        }
        if (typeof m.label !== 'string' || (m.label as string).length > 120) {
          return NextResponse.json({ error: 'Milestone label must be a string (max 120 chars)' }, { status: 400 });
        }
        if (typeof m.completed !== 'boolean') {
          return NextResponse.json({ error: 'Milestone completed must be a boolean' }, { status: 400 });
        }
        if (m.dueDate !== null && m.dueDate !== undefined && typeof m.dueDate !== 'string') {
          return NextResponse.json({ error: 'Milestone dueDate must be a string or null' }, { status: 400 });
        }
        if (m.completedAt !== null && m.completedAt !== undefined && typeof m.completedAt !== 'string') {
          return NextResponse.json({ error: 'Milestone completedAt must be a string or null' }, { status: 400 });
        }
      }
      milestonesVal = truncated.map((item) => {
        const m = item as Record<string, unknown>;
        return {
          id: m.id as string,
          label: (m.label as string).slice(0, 120),
          dueDate: (m.dueDate as string | null | undefined) ?? null,
          completed: m.completed as boolean,
          completedAt: (m.completedAt as string | null | undefined) ?? null,
        };
      });
    }

    const valueVal = body.value != null && body.value !== '' ? parseFloat(body.value) : null;
    if (valueVal !== null && isNaN(valueVal)) {
      return NextResponse.json({ error: 'Invalid value' }, { status: 400 });
    }
    const commissionRateVal =
      body.commissionRate != null && body.commissionRate !== ''
        ? parseFloat(body.commissionRate)
        : body.commissionRate === null
          ? null
          : undefined;
    if (commissionRateVal !== null && commissionRateVal !== undefined && (isNaN(commissionRateVal) || commissionRateVal < 0 || commissionRateVal > 100)) {
      return NextResponse.json({ error: 'Invalid commissionRate (must be 0–100)' }, { status: 400 });
    }
    const probabilityVal =
      body.probability != null && body.probability !== ''
        ? parseInt(String(body.probability), 10)
        : body.probability === null
          ? null
          : undefined;
    if (probabilityVal !== null && probabilityVal !== undefined && (isNaN(probabilityVal) || probabilityVal < 0 || probabilityVal > 100)) {
      return NextResponse.json({ error: 'Invalid probability (must be 0–100)' }, { status: 400 });
    }

    let closeDateVal: string | null = null;
    if (body.closeDate) {
      const d = new Date(body.closeDate);
      if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid closeDate' }, { status: 400 });
      closeDateVal = d.toISOString();
    }

    let followUpAtVal: string | null | undefined = undefined;
    if (body.followUpAt !== undefined) {
      if (!body.followUpAt) {
        followUpAtVal = null;
      } else {
        const d = new Date(body.followUpAt);
        if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid followUpAt' }, { status: 400 });
        followUpAtVal = d.toISOString();
      }
    }

    // next-action: free-form string + optional due timestamp.
    let nextActionVal: string | null | undefined = undefined;
    if (body.nextAction !== undefined) {
      if (body.nextAction === null || body.nextAction === '') {
        nextActionVal = null;
      } else {
        nextActionVal = String(body.nextAction).trim().slice(0, 280);
      }
    }
    let nextActionDueAtVal: string | null | undefined = undefined;
    if (body.nextActionDueAt !== undefined) {
      if (!body.nextActionDueAt) {
        nextActionDueAtVal = null;
      } else {
        const d = new Date(body.nextActionDueAt);
        if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid nextActionDueAt' }, { status: 400 });
        nextActionDueAtVal = d.toISOString();
      }
    }

    const stageChanged = body.stageId && body.stageId !== existing.stageId;
    const statusChanged = body.status && body.status !== existing.status;

    // Validate stageId belongs to this space BEFORE any mutations so an
    // invalid stageId cannot leave the row in a partially-updated state.
    if (body.stageId !== undefined) {
      const { data: stageCheck } = await supabase
        .from('DealStage')
        .select('id')
        .eq('id', body.stageId)
        .eq('spaceId', space.id)
        .maybeSingle();
      if (!stageCheck) {
        return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
      }
    }

    // Validate title/description lengths and priority enum
    if (body.title !== undefined && (typeof body.title !== 'string' || body.title.length > 255)) {
      return NextResponse.json({ error: 'Title must be under 255 chars' }, { status: 400 });
    }
    if (body.description !== undefined && typeof body.description === 'string' && body.description.length > 5000) {
      return NextResponse.json({ error: 'Description must be under 5000 chars' }, { status: 400 });
    }
    const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
    if (body.priority !== undefined && !VALID_PRIORITIES.includes(body.priority)) {
      return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
    }

    // Handle dealContacts replacement — diff-based instead of delete-all-then-insert.
    // The old approach left the list empty between the DELETE and the INSERT, so
    // two concurrent PATCHes raced (both DELETE, then both INSERT — losing the
    // other side's edits). A failed INSERT after a successful DELETE left the
    // deal with NO contacts. Computing the add/remove diff keeps the list in a
    // valid intermediate state at every step.
    if (body.contactIds) {
      const { data: existingRows, error: exErr } = await supabase
        .from('DealContact')
        .select('contactId')
        .eq('dealId', id);
      if (exErr) {
        console.error('[deals/PATCH] dealContact fetch error:', exErr);
        return NextResponse.json({ error: 'Failed to read deal contacts' }, { status: 500 });
      }
      const existingIds = new Set<string>((existingRows ?? []).map((r: { contactId: string }) => r.contactId));

      const wantedRaw = body.contactIds as string[];
      let wantedIds: Set<string>;
      if (wantedRaw.length > 0) {
        const { data: validContacts, error: vcError } = await supabase
          .from('Contact')
          .select('id')
          .in('id', wantedRaw)
          .eq('spaceId', space.id);
        if (vcError) {
          console.error('[deals/PATCH] contact validation error:', vcError);
          return NextResponse.json({ error: 'Failed to validate contacts' }, { status: 500 });
        }
        wantedIds = new Set((validContacts ?? []).map((c: { id: string }) => c.id));
      } else {
        wantedIds = new Set();
      }

      const toRemove = [...existingIds].filter((cId) => !wantedIds.has(cId));
      const toAdd = [...wantedIds].filter((cId) => !existingIds.has(cId));

      if (toRemove.length > 0) {
        const { error: delError } = await supabase
          .from('DealContact')
          .delete()
          .eq('dealId', id)
          .in('contactId', toRemove);
        if (delError) {
          console.error('[deals/PATCH] dealContact delete error:', delError);
          return NextResponse.json({ error: 'Failed to update deal contacts' }, { status: 500 });
        }
      }
      if (toAdd.length > 0) {
        const dcInserts = toAdd.map((cId) => ({ dealId: id, contactId: cId }));
        const { error: insertError } = await supabase.from('DealContact').insert(dcInserts);
        if (insertError) {
          console.error('[deals/PATCH] dealContact insert error:', insertError);
          return NextResponse.json({ error: 'Failed to link contacts' }, { status: 500 });
        }
      }
    }

    const { data: dealRow, error: updateError } = await supabase
      .from('Deal')
      .update({
        ...(body.title !== undefined && { title: String(body.title).slice(0, 255) }),
        ...(body.description !== undefined && { description: body.description ? String(body.description).slice(0, 5000) : null }),
        ...(body.value !== undefined && { value: valueVal }),
        ...(commissionRateVal !== undefined && { commissionRate: commissionRateVal }),
        ...(probabilityVal !== undefined && { probability: probabilityVal }),
        ...(body.address !== undefined && { address: body.address ?? null }),
        ...(body.priority !== undefined && { priority: body.priority }),
        ...(body.closeDate !== undefined && { closeDate: closeDateVal }),
        ...(body.stageId !== undefined && { stageId: body.stageId }),
        ...(body.position !== undefined && { position: body.position }),
        ...(body.status !== undefined && { status: body.status }),
        // When stageId changes, stamp stageChangedAt so daysInStage actually
        // reflects "time in current stage" — not "time since any field edit".
        // Mirrors the Contact behaviour added in migration 20260316000004.
        ...(stageChanged && { stageChangedAt: new Date().toISOString() }),
        ...(followUpAtVal !== undefined && { followUpAt: followUpAtVal }),
        ...(milestonesVal !== undefined && { milestones: milestonesVal }),
        ...(nextActionVal !== undefined && { nextAction: nextActionVal }),
        ...(nextActionDueAtVal !== undefined && { nextActionDueAt: nextActionDueAtVal }),
        // propertyId: null unlinks; otherwise validated as string referencing a
        // Property in this space. We don't load the row here — the FK will
        // reject a mismatched id; validating at edit time adds a round-trip
        // without additional safety.
        ...(body.propertyId !== undefined && {
          propertyId: body.propertyId ? String(body.propertyId).slice(0, 64) : null,
        }),
        // Won/lost post-mortem fields — captured from the kanban dialog.
        // When the deal transitions back to active we clear them so stale
        // reasons don't confuse a later close.
        ...(body.wonLostReason !== undefined && { wonLostReason: body.wonLostReason ? String(body.wonLostReason).slice(0, 120) : null }),
        ...(body.wonLostNote !== undefined && { wonLostNote: body.wonLostNote ? String(body.wonLostNote).slice(0, 2000) : null }),
        ...(body.status === 'active' && { wonLostReason: null, wonLostNote: null }),
        updatedAt: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (updateError) {
      console.error('[deals/PATCH] update error:', updateError);
      return NextResponse.json({ error: 'Failed to update deal' }, { status: 500 });
    }

    // Auto-log stage_change and status_change activities
    const activityInserts: Array<{ id: string; dealId: string; spaceId: string; type: string; content: string; metadata: Record<string, unknown> }> = [];
    if (stageChanged) {
      const { data: newStageRow } = await supabase.from('DealStage').select('name').eq('id', body.stageId).maybeSingle();
      const { data: oldStageRow } = await supabase.from('DealStage').select('name').eq('id', existing.stageId).maybeSingle();
      activityInserts.push({
        id: crypto.randomUUID(),
        dealId: id,
        spaceId: existing.spaceId,
        type: 'stage_change',
        content: `Moved from "${oldStageRow?.name ?? 'Unknown'}" to "${newStageRow?.name ?? 'Unknown'}"`,
        metadata: { fromStageId: existing.stageId, toStageId: body.stageId },
      });
    }
    if (statusChanged) {
      const labelMap: Record<string, string> = { active: 'Active', won: 'Won', lost: 'Lost', on_hold: 'On Hold' };
      const statusMetadata: Record<string, unknown> = { fromStatus: existing.status, toStatus: body.status };
      if ((body.status === 'won' || body.status === 'lost') && body.wonLostReason) {
        statusMetadata.reason = String(body.wonLostReason).slice(0, 100);
      }
      if ((body.status === 'won' || body.status === 'lost') && body.wonLostNote) {
        statusMetadata.note = String(body.wonLostNote).slice(0, 120);
      }
      activityInserts.push({
        id: crypto.randomUUID(),
        dealId: id,
        spaceId: existing.spaceId,
        type: 'status_change',
        content: `Marked as ${labelMap[body.status] ?? body.status}`,
        metadata: statusMetadata,
      });
    }
    if (activityInserts.length > 0) {
      await supabase.from('DealActivity').insert(activityInserts);
    }

    // Get stage for the include
    const stageIdToFetch = body.stageId ?? existing.stageId;
    const { data: stageRow, error: stageError } = await supabase
      .from('DealStage')
      .select('*')
      .eq('id', stageIdToFetch)
      .single();
    if (stageError && stageError.code !== 'PGRST116') {
      console.error('[deals/PATCH] stage fetch error:', stageError);
    }

    const deal = {
      ...dealRow,
      stage: stageRow || null
    } as Deal & { stage: DealStage | null };

    syncDeal({ ...deal, stage: deal.stage ?? undefined }).catch(console.error);
    void audit({ actorClerkId: userId, action: 'UPDATE', resource: 'Deal', resourceId: id, spaceId: space.id, req });

    // Fire the agent trigger on stage transitions so Chippi reacts in real
    // time to a deal moving stages (e.g. drafts a "we're under contract" SMS
    // to the contact, or marks the win/loss). Never fails the response.
    if (stageChanged) {
      try {
        await fireAgentTrigger({ spaceId: space.id, event: 'deal_stage_changed', dealId: id });
      } catch (e) {
        console.error('[deals/PATCH] agent trigger failed:', e);
      }
    }

    return NextResponse.json(deal);
  } catch (err) {
    console.error('[deals/PATCH] unexpected error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: dealRows, error: dealError } = await supabase
    .from('Deal')
    .select('*')
    .eq('id', id)
    .eq('spaceId', space.id);
  if (dealError) throw dealError;
  if (!dealRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const deal = dealRows[0];

  const { error: deleteError } = await supabase
    .from('Deal')
    .delete()
    .eq('id', id)
    .eq('spaceId', space.id);
  if (deleteError) throw deleteError;
  deleteDealVector(deal.spaceId, id).catch(console.error);
  void audit({
    actorClerkId: userId,
    action: 'DELETE',
    resource: 'Deal',
    resourceId: id,
    spaceId: space.id,
    req: _req,
    metadata: { title: deal.title },
  });

  return NextResponse.json({ success: true });
}
