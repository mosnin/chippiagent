import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const status = req.nextUrl.searchParams.get('status') ?? 'pending';
  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10);
  const limit = Math.min(isNaN(limitParam) ? 20 : limitParam, 50);

  const { data, error } = await supabase
    .from('AgentQuestion')
    .select('*, Contact:contactId(id,name)')
    .eq('spaceId', space.id)
    .eq('status', status)
    .order('priority', { ascending: false })
    .order('createdAt', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { question, context, contactId, priority, agentType, runId } = body;

  if (typeof question !== 'string' || question.length < 10 || question.length > 500) {
    return NextResponse.json(
      { error: 'question must be between 10 and 500 characters' },
      { status: 400 },
    );
  }

  if (context !== undefined && context !== null) {
    if (typeof context !== 'string' || context.length > 1000) {
      return NextResponse.json(
        { error: 'context must be 1000 characters or fewer' },
        { status: 400 },
      );
    }
  }

  // Validate contactId belongs to this space if provided
  if (contactId) {
    const { data: c } = await supabase.from('Contact').select('id')
      .eq('id', contactId).eq('spaceId', space.id).maybeSingle();
    if (!c) return NextResponse.json({ error: 'Contact not found' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('AgentQuestion')
    .insert({
      id: crypto.randomUUID(),
      spaceId: space.id,
      runId: runId ?? 'manual',
      agentType: agentType ?? 'coordinator',
      question,
      context: context ?? null,
      contactId: contactId ?? null,
      priority: priority ?? 0,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return NextResponse.json(data, { status: 201 });
}
