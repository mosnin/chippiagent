import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { assertSpaceEnabled } from '@/lib/agent/kill-switch';

// ── GET /api/agent/approvals ──────────────────────────────────────────────────
// Returns all AgentTask rows in 'paused' status with a non-null
// metadata->approvalRequired field, scoped to the calling user's space.
//
// KR1: auth-scoped, filters status=paused + approvalRequired present.

export async function GET(req: NextRequest) {
  // Suppress unused-var lint: req kept for Next.js route signature.
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

  // Filter: paused tasks where metadata->approvalRequired is not null.
  // Supabase PostgREST supports `not` with `is` for null checks on jsonb paths.
  const { data: tasks, error } = await supabase
    .from('AgentTask')
    .select('*')
    .eq('spaceId', space.id)
    .eq('status', 'paused')
    .not('metadata->approvalRequired', 'is', null)
    .order('createdAt', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[agent/approvals/GET] query error:', error);
    return NextResponse.json({ error: 'Failed to fetch pending approvals' }, { status: 500 });
  }

  return NextResponse.json({ tasks: tasks ?? [] });
}

// ── POST /api/agent/approvals ─────────────────────────────────────────────────
// Approve or reject a paused AgentTask.
//
// Body: { taskId: string; action: 'approve' | 'reject'; reason?: string }
//
// KR2: approve → status = 'queued', metadata gets approvedAt + approvedBy
// KR3: reject  → status = 'cancelled', metadata gets rejectedAt + rejectedBy + rejectionReason

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

  const { taskId, action, reason } = body;

  if (!taskId || typeof taskId !== 'string') {
    return NextResponse.json({ error: 'taskId required' }, { status: 400 });
  }
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
  }

  // Fetch the task and verify it belongs to this space and is paused.
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
    return NextResponse.json(
      { error: `Task is not awaiting approval (status: ${task.status})` },
      { status: 409 },
    );
  }

  const existingMeta = (task.metadata as Record<string, unknown>) ?? {};
  const now = new Date().toISOString();

  let newStatus: string;
  let metadataPatch: Record<string, unknown>;

  if (action === 'approve') {
    newStatus = 'queued';
    metadataPatch = {
      ...existingMeta,
      approvedAt: now,
      approvedBy: userId,
    };
  } else {
    newStatus = 'cancelled';
    metadataPatch = {
      ...existingMeta,
      rejectedAt: now,
      rejectedBy: userId,
      ...(typeof reason === 'string' && reason.trim().length > 0
        ? { rejectionReason: reason.trim() }
        : {}),
    };
  }

  const { data: updated, error: updateError } = await supabase
    .from('AgentTask')
    .update({
      status: newStatus,
      metadata: metadataPatch,
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
