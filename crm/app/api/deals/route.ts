import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { syncDeal } from '@/lib/vectorize';
import { notifyNewDeal } from '@/lib/notify';
import type { Deal, DealStage } from '@/lib/types';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Get deals with stage (paginated)
  const limit = Math.min(Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '200') || 200), 500);
  const offset = Math.max(0, parseInt(req.nextUrl.searchParams.get('offset') ?? '0') || 0);

  const { data: dealRows, error: dealError } = await supabase
    .from('Deal')
    .select('*, DealStage(id, spaceId, name, color, position)')
    .eq('spaceId', space.id)
    .order('position', { ascending: true })
    .range(offset, offset + limit - 1);
  if (dealError) throw dealError;

  const dealIds = dealRows.map((r: any) => r.id);

  // Get dealContacts with contact info
  let dealContactRows: any[] = [];
  if (dealIds.length > 0) {
    const { data, error: dcError } = await supabase
      .from('DealContact')
      .select('dealId, contactId, Contact(id, name)')
      .in('dealId', dealIds);
    if (dcError) throw dcError;
    dealContactRows = data || [];
  }

  // Group dealContacts by dealId
  const dcByDeal = new Map<string, any[]>();
  for (const dc of dealContactRows) {
    const arr = dcByDeal.get(dc.dealId) || [];
    arr.push({
      dealId: dc.dealId,
      contactId: dc.contactId,
      contact: dc.Contact ? { id: dc.Contact.id, name: dc.Contact.name } : null
    });
    dcByDeal.set(dc.dealId, arr);
  }

  const deals = dealRows.map((row: any) => ({
    id: row.id,
    spaceId: row.spaceId,
    title: row.title,
    description: row.description,
    value: row.value,
    commissionRate: row.commissionRate ?? null,
    probability: row.probability ?? null,
    address: row.address,
    priority: row.priority,
    closeDate: row.closeDate,
    stageId: row.stageId,
    position: row.position,
    status: row.status,
    followUpAt: row.followUpAt,
    milestones: row.milestones ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    stage: row.DealStage
      ? {
          id: row.DealStage.id,
          spaceId: row.DealStage.spaceId,
          name: row.DealStage.name,
          color: row.DealStage.color,
          position: row.DealStage.position
        }
      : null,
    dealContacts: dcByDeal.get(row.id) || []
  }));

  return NextResponse.json(deals);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, title, description, value, commissionRate, probability, milestones, address, priority, closeDate, stageId, contactIds } = body;

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Validate title length
  if (!title || typeof title !== 'string' || title.trim().length === 0 || title.trim().length > 255) {
    return NextResponse.json({ error: 'Title required (max 255 chars)' }, { status: 400 });
  }

  // Verify the target stage belongs to this space (prevents cross-space stage injection)
  const { data: stageCheck, error: stageCheckErr } = await supabase
    .from('DealStage')
    .select('id, pipelineType')
    .eq('id', stageId)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (stageCheckErr) throw stageCheckErr;
  if (!stageCheck) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });

  // If contacts include a buyer or seller, auto-assign to the matching pipeline's first stage.
  // Buyer takes precedence over seller when both are present.
  let finalStageId = stageId;
  if (contactIds?.length) {
    const currentPipeline = stageCheck.pipelineType as string | null;
    if (currentPipeline !== 'buyer') {
      const { data: buyerContacts } = await supabase
        .from('Contact')
        .select('id, leadType')
        .in('id', contactIds)
        .eq('spaceId', space.id)
        .eq('leadType', 'buyer')
        .limit(1);
      if (buyerContacts && buyerContacts.length > 0) {
        const { data: buyerStage } = await supabase
          .from('DealStage')
          .select('id')
          .eq('spaceId', space.id)
          .eq('pipelineType', 'buyer')
          .order('position', { ascending: true })
          .limit(1);
        if (buyerStage && buyerStage.length > 0) {
          finalStageId = buyerStage[0].id;
        }
      }
    }
    if (finalStageId === stageId && currentPipeline !== 'seller') {
      const { data: sellerContacts } = await supabase
        .from('Contact')
        .select('id, leadType')
        .in('id', contactIds)
        .eq('spaceId', space.id)
        .eq('leadType', 'seller')
        .limit(1);
      if (sellerContacts && sellerContacts.length > 0) {
        const { data: sellerStage } = await supabase
          .from('DealStage')
          .select('id')
          .eq('spaceId', space.id)
          .eq('pipelineType', 'seller')
          .order('position', { ascending: true })
          .limit(1);
        if (sellerStage && sellerStage.length > 0) {
          finalStageId = sellerStage[0].id;
        }
      }
    }
  }

  const { data: lastDealRows, error: lastDealError } = await supabase
    .from('Deal')
    .select('position')
    .eq('stageId', finalStageId)
    .order('position', { ascending: false })
    .limit(1);
  if (lastDealError) throw lastDealError;
  const lastPosition = lastDealRows.length > 0 ? lastDealRows[0].position : -1;

  const dealId = crypto.randomUUID();
  const valueVal = value != null && value !== '' ? parseFloat(value) : null;
  if (valueVal !== null && isNaN(valueVal)) {
    return NextResponse.json({ error: 'Invalid value' }, { status: 400 });
  }
  const commissionRateVal = commissionRate != null && commissionRate !== '' ? parseFloat(commissionRate) : null;
  if (commissionRateVal !== null && (isNaN(commissionRateVal) || commissionRateVal < 0 || commissionRateVal > 100)) {
    return NextResponse.json({ error: 'Invalid commissionRate (must be 0–100)' }, { status: 400 });
  }
  const probabilityVal = probability != null && probability !== '' ? parseInt(String(probability), 10) : null;
  if (probabilityVal !== null && (isNaN(probabilityVal) || probabilityVal < 0 || probabilityVal > 100)) {
    return NextResponse.json({ error: 'Invalid probability (must be 0–100)' }, { status: 400 });
  }
  let closeDateVal: string | null = null;
  if (closeDate) {
    const d = new Date(closeDate);
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid closeDate' }, { status: 400 });
    closeDateVal = d.toISOString();
  }

  let milestonesVal: import('@/lib/types').DealMilestone[] = [];
  if (milestones !== undefined) {
    if (!Array.isArray(milestones)) {
      return NextResponse.json({ error: 'milestones must be an array' }, { status: 400 });
    }
    const truncated = (milestones as unknown[]).slice(0, 20);
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

  const nowIso = new Date().toISOString();
  const { data: dealRow, error: dealError } = await supabase.from('Deal').insert({
    id: dealId,
    spaceId: space.id,
    title,
    description: description || null,
    value: valueVal,
    commissionRate: commissionRateVal,
    probability: probabilityVal,
    milestones: milestonesVal,
    address: address || null,
    priority: priority || 'MEDIUM',
    closeDate: closeDateVal,
    stageId: finalStageId,
    // The deal enters its initial stage right now. Without this, dealHealth
    // can't compute "days in stage" until the first stage move sets it.
    stageChangedAt: nowIso,
    position: lastPosition + 1,
  }).select().single();
  if (dealError) throw dealError;

  // Insert dealContacts — verify all contacts belong to this space
  if (contactIds?.length) {
    const { data: validContacts, error: vcError } = await supabase
      .from('Contact')
      .select('id')
      .in('id', contactIds)
      .eq('spaceId', space.id);
    if (vcError) throw vcError;
    const validIds = new Set((validContacts ?? []).map((c: { id: string }) => c.id));
    const dcInserts = (contactIds as string[]).filter((cId) => validIds.has(cId)).map((cId) => ({ dealId, contactId: cId }));
    if (dcInserts.length > 0) {
      const { error: dcError } = await supabase.from('DealContact').insert(dcInserts);
      if (dcError) throw dcError;
    }
  }

  // Get stage for the include
  const { data: stageRow, error: stageError } = await supabase
    .from('DealStage')
    .select('*')
    .eq('id', finalStageId)
    .single();
  if (stageError && stageError.code !== 'PGRST116') throw stageError;

  const deal = {
    ...dealRow,
    stage: stageRow || null
  } as Deal & { stage: DealStage | null };

  syncDeal({ ...deal, stage: deal.stage ?? undefined }).catch(console.error);

  // Email + SMS notification for new deal
  try {
    await notifyNewDeal({
      spaceId: space.id,
      dealTitle: title,
      dealValue: valueVal,
      dealAddress: address || null,
      dealPriority: priority || null,
    });
  } catch (e) { console.error('[deals] notification failed:', e); }

  return NextResponse.json(deal, { status: 201 });
}
