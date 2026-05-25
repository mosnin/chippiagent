import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

async function resolveSpace(userId: string, dealId: string) {
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id, itemId } = await params;
  const space = await resolveSpace(userId, id);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (body.completed !== undefined) {
    patch.completedAt = body.completed ? new Date().toISOString() : null;
  }
  if (body.label !== undefined) {
    const label = String(body.label).trim().slice(0, 200);
    if (!label) return NextResponse.json({ error: 'Label cannot be empty' }, { status: 400 });
    patch.label = label;
  }
  if (body.dueAt !== undefined) {
    if (body.dueAt === null) {
      patch.dueAt = null;
    } else {
      const d = new Date(body.dueAt as string);
      if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid dueAt' }, { status: 400 });
      patch.dueAt = d.toISOString();
    }
  }

  const { data, error } = await supabase
    .from('DealChecklistItem')
    .update(patch)
    .eq('id', itemId)
    .eq('dealId', id)
    .eq('spaceId', space.id)
    .select()
    .single();

  if (error) {
    logger.error('[deals/checklist] patch failed', { dealId: id, itemId }, error);
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id, itemId } = await params;
  const space = await resolveSpace(userId, id);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await supabase
    .from('DealChecklistItem')
    .delete()
    .eq('id', itemId)
    .eq('dealId', id)
    .eq('spaceId', space.id);

  if (error) {
    logger.error('[deals/checklist] delete failed', { dealId: id, itemId }, error);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
