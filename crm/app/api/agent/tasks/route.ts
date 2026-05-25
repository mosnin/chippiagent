import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { enqueueTask } from '@/lib/agent/task-state-machine';
import { checkRateLimit } from '@/lib/rate-limit';
import { assertSpaceEnabled } from '@/lib/agent/kill-switch';

// ── GET /api/agent/tasks?spaceId=... ─────────────────────────────────────────
// List tasks for a space, ordered newest-first, capped at 50.

export async function GET(req: NextRequest) {
  const spaceId = req.nextUrl.searchParams.get('spaceId');
  if (!spaceId) {
    return NextResponse.json({ error: 'spaceId required' }, { status: 400 });
  }

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const rl = await checkRateLimit(`agent:tasks:list:${userId}`, 60, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: undefined },
      { status: 429 },
    );
  }

  // Verify the space belongs to the calling user.
  const space = await getSpaceForUser(userId);
  if (!space || space.id !== spaceId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await assertSpaceEnabled(spaceId);
  } catch {
    return NextResponse.json({ error: 'Space is disabled' }, { status: 403 });
  }

  const { data: tasks, error } = await supabase
    .from('AgentTask')
    .select('*')
    .eq('spaceId', spaceId)
    .order('createdAt', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[agent/tasks/GET] query error:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }

  return NextResponse.json({ tasks: tasks ?? [] });
}

// ── POST /api/agent/tasks ─────────────────────────────────────────────────────
// Enqueue a new task for a space.

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { spaceId, goal } = body as { spaceId?: string; goal?: string };

  if (!spaceId || typeof spaceId !== 'string') {
    return NextResponse.json({ error: 'spaceId required' }, { status: 400 });
  }
  if (!goal || typeof goal !== 'string' || goal.trim().length === 0) {
    return NextResponse.json({ error: 'goal required' }, { status: 400 });
  }

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const rl = await checkRateLimit(`agent:tasks:create:${userId}`, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: undefined },
      { status: 429 },
    );
  }

  // Verify the space belongs to the calling user.
  const space = await getSpaceForUser(userId);
  if (!space || space.id !== spaceId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await assertSpaceEnabled(spaceId);
  } catch {
    return NextResponse.json({ error: 'Space is disabled' }, { status: 403 });
  }

  try {
    const taskId = await enqueueTask(spaceId, {
      title: goal.trim().slice(0, 255),
      goalDescription: goal.trim(),
      triggerSource: 'manual',
    });

    // Fetch the newly-created row so we can return canonical fields.
    const { data: task, error: fetchError } = await supabase
      .from('AgentTask')
      .select('id, status, title, goalDescription, createdAt')
      .eq('id', taskId)
      .single();

    if (fetchError || !task) {
      console.error('[agent/tasks/POST] fetch after insert error:', fetchError);
      return NextResponse.json({ error: 'Task created but could not be retrieved' }, { status: 500 });
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    console.error('[agent/tasks/POST] enqueue error:', err);
    return NextResponse.json({ error: 'Failed to enqueue task' }, { status: 500 });
  }
}
