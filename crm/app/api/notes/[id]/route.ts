import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

type Params = { params: Promise<{ id: string }> };

// GET /api/notes/[id] — get a single note with full content
export async function GET(_req: NextRequest, { params }: Params) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;
  const { id } = await params;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('Note')
    .select('*')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}

// PATCH /api/notes/[id] — update note title or content (auto-save)
export async function PATCH(req: NextRequest, { params }: Params) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;
  const { id } = await params;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (body.title !== undefined) updates.title = String(body.title).slice(0, 200);
  if (body.content !== undefined) updates.content = String(body.content).slice(0, 500000); // 500KB max
  if (body.icon !== undefined) updates.icon = body.icon ? String(body.icon).slice(0, 10) : null;
  if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder);

  const { data, error } = await supabase
    .from('Note')
    .update(updates)
    .eq('id', id)
    .eq('spaceId', space.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/notes/[id] — delete a note
export async function DELETE(_req: NextRequest, { params }: Params) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;
  const { id } = await params;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await supabase
    .from('Note')
    .delete()
    .eq('id', id)
    .eq('spaceId', space.id);

  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  return NextResponse.json({ success: true });
}
