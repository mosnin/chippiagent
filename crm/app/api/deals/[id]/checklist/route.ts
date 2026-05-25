import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { TEMPLATES, materializeTemplate, type ChecklistKind, type TemplateId } from '@/lib/deals/checklist';

const VALID_KINDS: ChecklistKind[] = [
  'earnest_money',
  'inspection',
  'appraisal',
  'loan_commitment',
  'clear_to_close',
  'final_walkthrough',
  'closing',
  'custom',
];

async function resolveDealAndSpace(userId: string, dealId: string) {
  const space = await getSpaceForUser(userId);
  if (!space) return null;
  const { data: deal, error } = await supabase
    .from('Deal')
    .select('id, spaceId, closeDate')
    .eq('id', dealId)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (error) throw error;
  if (!deal) return null;
  return { deal, space };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const ctx = await resolveDealAndSpace(userId, id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('DealChecklistItem')
    .select('*')
    .eq('dealId', id)
    .order('position', { ascending: true });

  if (error) {
    logger.error('[deals/checklist] fetch failed', { dealId: id }, error);
    return NextResponse.json({ error: 'Failed to fetch checklist' }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

/**
 * POST body shapes:
 *   { seed: 'buyer_residential' }  → populate the canonical template
 *   { kind, label, dueAt? }        → add a single item (kind = 'custom' ok)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const ctx = await resolveDealAndSpace(userId, id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { deal, space } = ctx;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.seed === 'string' && body.seed in TEMPLATES) {
    const templateId = body.seed as TemplateId;
    // Refuse if items already exist — template seed is additive-by-intent.
    const { count } = await supabase
      .from('DealChecklistItem')
      .select('id', { count: 'exact', head: true })
      .eq('dealId', id);
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: 'Checklist already has items' }, { status: 409 });
    }

    const materialised = materializeTemplate(TEMPLATES[templateId].items, deal.closeDate);
    const rows = materialised.map((m) => ({
      id: crypto.randomUUID(),
      dealId: id,
      spaceId: space.id,
      kind: m.kind,
      label: m.label,
      dueAt: m.dueAt,
      position: m.position,
    }));

    const { data, error } = await supabase.from('DealChecklistItem').insert(rows).select();
    if (error) {
      logger.error('[deals/checklist] seed failed', { dealId: id }, error);
      return NextResponse.json({ error: 'Failed to seed checklist' }, { status: 500 });
    }
    return NextResponse.json(data ?? [], { status: 201 });
  }

  // Single custom item
  const kind = typeof body.kind === 'string' ? body.kind : 'custom';
  if (!VALID_KINDS.includes(kind as ChecklistKind)) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
  }
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 200) : '';
  if (!label) return NextResponse.json({ error: 'Label required' }, { status: 400 });

  let dueAt: string | null = null;
  if (body.dueAt) {
    const d = new Date(body.dueAt as string);
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid dueAt' }, { status: 400 });
    dueAt = d.toISOString();
  }

  const { data: maxRow } = await supabase
    .from('DealChecklistItem')
    .select('position')
    .eq('dealId', id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = (maxRow?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from('DealChecklistItem')
    .insert({
      id: crypto.randomUUID(),
      dealId: id,
      spaceId: space.id,
      kind,
      label,
      dueAt,
      position: nextPosition,
    })
    .select()
    .single();

  if (error) {
    logger.error('[deals/checklist] insert failed', { dealId: id }, error);
    return NextResponse.json({ error: 'Failed to add item' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
