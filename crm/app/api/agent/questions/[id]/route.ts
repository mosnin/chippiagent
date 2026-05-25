import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

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
  const { answer } = body;

  if (typeof answer !== 'string' || answer.length < 1 || answer.length > 2000) {
    return NextResponse.json(
      { error: 'answer must be between 1 and 2000 characters' },
      { status: 400 },
    );
  }

  // Verify the question belongs to this space
  const { data: existing } = await supabase
    .from('AgentQuestion')
    .select('id, status')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (existing.status !== 'pending') {
    return NextResponse.json(
      { error: `Question is already ${existing.status}` },
      { status: 409 },
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from('AgentQuestion')
    .update({
      status: 'answered',
      answer,
      answeredAt: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('spaceId', space.id)
    .select()
    .single();

  if (updateError) throw updateError;
  return NextResponse.json(updated);
}
