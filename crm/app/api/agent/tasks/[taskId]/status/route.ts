import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import {
  canTransition,
  transitionTask,
  VALID_TRANSITIONS,
  type TaskStatus,
} from '@/lib/agent/task-state-machine';
import { checkRateLimit } from '@/lib/rate-limit';

const VALID_STATUSES = Object.keys(VALID_TRANSITIONS) as TaskStatus[];

// ── PATCH /api/agent/tasks/[taskId]/status ───────────────────────────────────
// Transition a task to the requested status.

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const rl = await checkRateLimit(`agent:tasks:status:${userId}`, 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: undefined },
      { status: 429 },
    );
  }

  const { taskId } = await params;

  const body = await req.json();
  const { status } = body as { status?: TaskStatus };

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }

  const space = await getSpaceForUser(userId);
  if (!space) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch current task to verify ownership and read current status.
  const { data: task, error: fetchError } = await supabase
    .from('AgentTask')
    .select('id, status')
    .eq('id', taskId)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (fetchError) {
    console.error('[agent/tasks/[taskId]/status/PATCH] fetch error:', fetchError);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Guard: validate the transition before writing.
  if (!canTransition(task.status as TaskStatus, status)) {
    return NextResponse.json(
      { error: `invalid_transition: cannot move from '${task.status}' to '${status}'` },
      { status: 409 },
    );
  }

  // Build optional timestamp metadata for terminal/active states.
  const now = new Date().toISOString();
  const meta: Parameters<typeof transitionTask>[2] = {};
  if (status === 'cancelled') meta.cancelledAt = now;
  if (status === 'completed') meta.completedAt = now;
  if (status === 'running')   meta.startedAt   = now;

  const previousStatus = task.status as TaskStatus;
  const result = await transitionTask(taskId, status, meta);

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Transition failed' }, { status: 409 });
  }

  // Log human interventions to the activity audit trail (non-blocking).
  const actionTypeMap: Partial<Record<TaskStatus, string>> = {
    paused: 'task_paused',
    cancelled: 'task_cancelled',
    running: 'task_resumed',
    completed: 'task_completed',
  };
  const actionType = actionTypeMap[status];
  if (actionType) {
    void Promise.resolve(
      supabase
        .from('AgentActivityLog')
        .insert({
          spaceId: space.id,
          runId: taskId,
          agentType: 'human',
          actionType,
          outcome: 'completed',
          reversible: status !== 'cancelled',
          metadata: { previousStatus, triggeredBy: 'user', userId },
        }),
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true, task: { id: taskId, status } });
}
