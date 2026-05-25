import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const VALID_STATUSES = ['active', 'completed', 'cancelled', 'paused'] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  if (!body.status || !(VALID_STATUSES as readonly string[]).includes(body.status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }

  // Verify the goal belongs to this space
  const { data: existing } = await supabase
    .from('AgentGoal')
    .select('id, status')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: body.status,
    updatedAt: now,
  };

  if (body.status === 'completed') {
    patch.completedAt = now;
  }

  if (body.completionNotes !== undefined) {
    patch.metadata = { completionNotes: body.completionNotes };
  }

  const { data, error } = await supabase
    .from('AgentGoal')
    .update(patch)
    .eq('id', id)
    .eq('spaceId', space.id)
    .select()
    .single();

  if (error) throw error;
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  // Verify the goal belongs to this space
  const { data: existing } = await supabase
    .from('AgentGoal')
    .select('id, status')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (existing.status === 'cancelled') {
    return NextResponse.json({ cancelled: true });
  }

  const { error } = await supabase
    .from('AgentGoal')
    .update({ status: 'cancelled', updatedAt: new Date().toISOString() })
    .eq('id', id)
    .eq('spaceId', space.id);

  if (error) throw error;
  return NextResponse.json({ cancelled: true });
}
