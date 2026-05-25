import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { isValidCommissionParty, type CommissionBasis } from '@/lib/commissions';

async function resolveDeal(userId: string, dealId: string) {
  const space = await getSpaceForUser(userId);
  if (!space) return null;
  const { data: deal } = await supabase
    .from('Deal')
    .select('id')
    .eq('id', dealId)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (!deal) return null;
  return space;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const space = await resolveDeal(userId, id);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('CommissionSplit')
    .select('*')
    .eq('dealId', id)
    .eq('spaceId', space.id)
    .order('createdAt', { ascending: true });

  if (error) {
    logger.error('[commission-splits/GET]', { dealId: id }, error);
    return NextResponse.json({ error: 'Failed to load splits' }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const space = await resolveDeal(userId, id);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  if (!isValidCommissionParty(body.party)) {
    return NextResponse.json({ error: 'Invalid party' }, { status: 400 });
  }
  const basis = body.basis === 'percent' || body.basis === 'flat' ? (body.basis as CommissionBasis) : null;
  if (!basis) return NextResponse.json({ error: 'basis must be percent or flat' }, { status: 400 });

  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 160) : '';
  if (!label) return NextResponse.json({ error: 'Label required' }, { status: 400 });

  let percentOfGci: number | null = null;
  let flatAmount: number | null = null;
  if (basis === 'percent') {
    const n = Number(body.percentOfGci);
    if (!isFinite(n) || n < 0 || n > 100) return NextResponse.json({ error: 'percentOfGci must be 0–100' }, { status: 400 });
    percentOfGci = n;
  } else {
    const n = Number(body.flatAmount);
    if (!isFinite(n) || n < 0) return NextResponse.json({ error: 'flatAmount must be ≥ 0' }, { status: 400 });
    flatAmount = n;
  }

  const paidAtRaw = body.paidAt;
  let paidAt: string | null = null;
  if (paidAtRaw) {
    const d = new Date(paidAtRaw as string);
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid paidAt' }, { status: 400 });
    paidAt = d.toISOString();
  }

  const { data, error } = await supabase
    .from('CommissionSplit')
    .insert({
      id: crypto.randomUUID(),
      dealId: id,
      spaceId: space.id,
      party: body.party,
      label,
      basis,
      percentOfGci,
      flatAmount,
      paidAt,
      notes: typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : null,
    })
    .select()
    .single();

  if (error) {
    logger.error('[commission-splits/POST]', { dealId: id }, error);
    return NextResponse.json({ error: 'Failed to create split' }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
