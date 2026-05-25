import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { isValidCommissionParty } from '@/lib/commissions';

async function resolve(userId: string, dealId: string, splitId: string) {
  const space = await getSpaceForUser(userId);
  if (!space) return null;
  const { data } = await supabase
    .from('CommissionSplit')
    .select('*')
    .eq('id', splitId)
    .eq('dealId', dealId)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (!data) return null;
  return { space, split: data };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; splitId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id, splitId } = await params;
  const ctx = await resolve(userId, id, splitId);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (body.party !== undefined) {
    if (!isValidCommissionParty(body.party)) return NextResponse.json({ error: 'Invalid party' }, { status: 400 });
    patch.party = body.party;
  }
  if (body.label !== undefined) {
    const label = String(body.label).trim().slice(0, 160);
    if (!label) return NextResponse.json({ error: 'Label cannot be empty' }, { status: 400 });
    patch.label = label;
  }
  if (body.basis !== undefined) {
    if (body.basis !== 'percent' && body.basis !== 'flat') return NextResponse.json({ error: 'Invalid basis' }, { status: 400 });
    patch.basis = body.basis;
    // Clear the other field when switching basis so the CHECK constraint is
    // satisfied in a single update.
    if (body.basis === 'percent') patch.flatAmount = null;
    else patch.percentOfGci = null;
  }
  if (body.percentOfGci !== undefined) {
    if (body.percentOfGci === null) patch.percentOfGci = null;
    else {
      const n = Number(body.percentOfGci);
      if (!isFinite(n) || n < 0 || n > 100) return NextResponse.json({ error: 'percentOfGci must be 0–100' }, { status: 400 });
      patch.percentOfGci = n;
    }
  }
  if (body.flatAmount !== undefined) {
    if (body.flatAmount === null) patch.flatAmount = null;
    else {
      const n = Number(body.flatAmount);
      if (!isFinite(n) || n < 0) return NextResponse.json({ error: 'flatAmount must be ≥ 0' }, { status: 400 });
      patch.flatAmount = n;
    }
  }
  if (body.paidAt !== undefined) {
    if (body.paidAt === null || body.paidAt === '') patch.paidAt = null;
    else {
      const d = new Date(body.paidAt as string);
      if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid paidAt' }, { status: 400 });
      patch.paidAt = d.toISOString();
    }
  }
  if (body.notes !== undefined) {
    patch.notes = body.notes ? String(body.notes).trim().slice(0, 500) : null;
  }

  const { data, error } = await supabase
    .from('CommissionSplit')
    .update(patch)
    .eq('id', splitId)
    .eq('dealId', id)
    .eq('spaceId', ctx.space.id)
    .select()
    .single();

  if (error) {
    logger.error('[commission-splits/PATCH]', { splitId }, error);
    return NextResponse.json({ error: 'Failed to update split' }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; splitId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id, splitId } = await params;
  const ctx = await resolve(userId, id, splitId);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await supabase
    .from('CommissionSplit')
    .delete()
    .eq('id', splitId)
    .eq('dealId', id)
    .eq('spaceId', ctx.space.id);

  if (error) {
    logger.error('[commission-splits/DELETE]', { splitId }, error);
    return NextResponse.json({ error: 'Failed to delete split' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
