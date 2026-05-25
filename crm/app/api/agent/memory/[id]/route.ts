/**
 * DELETE /api/agent/memory/[id]
 *
 * Removes one of Chippi's long-term memories. Scoped to the caller's space —
 * memories outside the caller's space return 404 indistinguishable from
 * non-existent rows so we don't leak existence across tenants.
 *
 * Editing memory content isn't supported in v1: the AgentMemory row carries a
 * vector embedding generated at write time, and editing without re-embedding
 * silently degrades retrieval. Until we wire re-embed-on-edit, the correction
 * pattern is "delete the wrong fact; let Chippi re-learn it."
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: row, error: fetchError } = await supabase
    .from('AgentMemory')
    .select('id')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error: deleteError } = await supabase
    .from('AgentMemory')
    .delete()
    .eq('id', id)
    .eq('spaceId', space.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
