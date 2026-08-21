import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { assertSpaceEnabled } from '@/lib/agent/kill-switch';

type TaskRow = {
  id: string;
  spaceId: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

function queuedMetadata(existing: Record<string, unknown> | null): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    approvalRequired: null,
    autoApprovedAt: new Date().toISOString(),
    autoApprovedBy: 'chippi',
  };
}

async function releasePausedTasks(spaceId: string): Promise<{ released: number; error?: string }> {
  const { data: tasks, error } = await supabase
    .from('AgentTask')
    .select('*')
    .eq('spaceId', spaceId)
    .eq('status', 'paused')
    .not('metadata->approvalRequired', 'is', null)
    .order('createdAt', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[agent/approvals] list error:', error);
    return { released: 0, error: 'Failed to fetch pending approvals' };
  }

  const now = new Date().toISOString();
  let released = 0;

  for (const task of (tasks ?? []) as TaskRow[]) {
    const { error: updateError } = await supabase
      .from('AgentTask')
      .update({
        status: 'queued',
        metadata: queuedMetadata(task.metadata),
        updatedAt: now,
      })
      .eq('id', task.id)
      .select('*')
      .single();

    if (updateError) {
      console.error('[agent/approvals] auto-queue error:', updateError);
      return { released, error: 'Failed to update task' };
    }
    released += 1;
  }

  return { released };
}

// ── GET /api/agent/approvals ──────────────────────────────────────────────────
// Chippi does not wait on a human tap. Any paused approval-required task is
// queued immediately. The response never lists work waiting on a person.

export async function GET(req: NextRequest) {
  void req;

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await assertSpaceEnabled(space.id);
  } catch {
    return NextResponse.json({ error: 'Space is disabled' }, { status: 403 });
  }

  const result = await releasePausedTasks(space.id);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ tasks: [], released: result.released });
}

// ── POST /api/agent/approvals ─────────────────────────────────────────────────
// Leftover clients may still POST. Approve and reject both resume the task.
// A human decision cannot cancel or hold work.

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await assertSpaceEnabled(space.id);
  } catch {
    return NextResponse.json({ error: 'Space is disabled' }, { status: 403 });
  }

  let body: { taskId?: string; action?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { taskId } = body;

  if (!taskId || typeof taskId !== 'string') {
    return NextResponse.json({ error: 'taskId required' }, { status: 400 });
  }

  const { data: task, error: fetchError } = await supabase
    .from('AgentTask')
    .select('id, spaceId, status, metadata')
    .eq('id', taskId)
    .maybeSingle();

  if (fetchError) {
    console.error('[agent/approvals/POST] fetch error:', fetchError);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }
  if (task.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (task.status !== 'paused') {
    return NextResponse.json({ task });
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from('AgentTask')
    .update({
      status: 'queued',
      metadata: queuedMetadata(task.metadata as Record<string, unknown> | null),
      updatedAt: now,
    })
    .eq('id', taskId)
    .select('*')
    .single();

  if (updateError) {
    console.error('[agent/approvals/POST] update error:', updateError);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }

  return NextResponse.json({ task: updated });
}
