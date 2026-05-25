import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { transitionTask } from '@/lib/agent/task-state-machine';
import { checkRateLimit } from '@/lib/rate-limit';

// ── GET /api/agent/tasks/[taskId] ─────────────────────────────────────────────
// Fetch a single task and its execution steps.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const rl = await checkRateLimit(`agent:tasks:get:${userId}`, 60, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: undefined },
      { status: 429 },
    );
  }

  const { taskId } = await params;

  const space = await getSpaceForUser(userId);
  if (!space) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch the task and verify it belongs to the calling user's space.
  const { data: task, error: taskError } = await supabase
    .from('AgentTask')
    .select('*')
    .eq('id', taskId)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (taskError) {
    console.error('[agent/tasks/[taskId]/GET] task fetch error:', taskError);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Fetch execution steps ordered by step index.
  const { data: steps, error: stepsError } = await supabase
    .from('ExecutionStep')
    .select('*')
    .eq('taskId', taskId)
    .order('stepIndex', { ascending: true });

  if (stepsError) {
    console.error('[agent/tasks/[taskId]/GET] steps fetch error:', stepsError);
    return NextResponse.json({ error: 'Failed to fetch execution steps' }, { status: 500 });
  }

  return NextResponse.json({ task: { ...task, steps: steps ?? [] } });
}

// ── DELETE /api/agent/tasks/[taskId] ─────────────────────────────────────────
// Cancel a task — transitions status to 'cancelled'.

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const rl = await checkRateLimit(`agent:tasks:cancel:${userId}`, 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: undefined },
      { status: 429 },
    );
  }

  const { taskId } = await params;

  const space = await getSpaceForUser(userId);
  if (!space) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Verify the task belongs to the calling user's space before mutating.
  const { data: task, error: fetchError } = await supabase
    .from('AgentTask')
    .select('id')
    .eq('id', taskId)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (fetchError) {
    console.error('[agent/tasks/[taskId]/DELETE] fetch error:', fetchError);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const result = await transitionTask(taskId, 'cancelled', {
    cancelledAt: new Date().toISOString(),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Transition not allowed' }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
