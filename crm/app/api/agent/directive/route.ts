import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { directive?: unknown };
  const { directive } = body;

  if (!directive || typeof directive !== 'string' || directive.trim().length < 3) {
    return NextResponse.json({ error: 'directive must be at least 3 characters' }, { status: 400 });
  }
  if (directive.length > 500) {
    return NextResponse.json({ error: 'directive must be 500 characters or fewer' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const key = `DIRECTIVE:${space.id}`;

  // Upsert — only one active directive at a time
  const { error } = await supabase
    .from('AgentMemory')
    .upsert({
      spaceId: space.id,
      entityType: 'space',
      entityId: space.id,
      memoryType: 'directive',
      key,
      content: `DIRECTIVE:${JSON.stringify({ text: directive.trim(), setAt: now })}`,
      importance: 1.0,
      updatedAt: now,
    }, { onConflict: 'key' });

  if (error) {
    console.error('[agent/directive] upsert failed', error);
    return NextResponse.json({ error: 'Failed to save directive' }, { status: 500 });
  }

  return NextResponse.json({ saved: true, directive: directive.trim() });
}
