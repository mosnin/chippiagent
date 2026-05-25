import { supabase } from '@/lib/supabase';

// ── Status types ──────────────────────────────────────────────────────────────

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

// ── Valid state transitions ───────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  queued:    ['running', 'cancelled'],
  running:   ['paused', 'completed', 'failed', 'cancelled'],
  paused:    ['running', 'cancelled'],
  completed: [],
  failed:    ['queued'],   // allows retry
  cancelled: [],
};

// ── Guard ─────────────────────────────────────────────────────────────────────

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Transition ────────────────────────────────────────────────────────────────

/**
 * Reads the current task status, validates the requested transition, then
 * writes the new status (plus any timestamp/metadata fields) to AgentTask.
 *
 * Never throws — callers in API routes can pattern-match on `ok`.
 */
export async function transitionTask(
  taskId: string,
  to: TaskStatus,
  meta?: {
    cancelledAt?: string;
    completedAt?: string;
    startedAt?: string;
    pausedReason?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  // 1. Read current status.
  const { data: row, error: fetchError } = await supabase
    .from('AgentTask')
    .select('status')
    .eq('id', taskId)
    .single();

  if (fetchError || !row) {
    return { ok: false, error: 'not_found' };
  }

  const current = row.status as TaskStatus;

  // 2. Validate transition.
  if (!canTransition(current, to)) {
    return { ok: false, error: 'invalid_transition' };
  }

  // 3. Build update object.
  const now = new Date().toISOString();

  const update: Record<string, unknown> = {
    status: to,
    updatedAt: now,
  };

  if (meta?.startedAt !== undefined)   update.startedAt   = meta.startedAt;
  if (meta?.completedAt !== undefined) update.completedAt = meta.completedAt;
  if (meta?.cancelledAt !== undefined) update.cancelledAt = meta.cancelledAt;

  // pausedReason has no dedicated column; park it in metadata so it survives.
  if (meta?.pausedReason !== undefined) {
    update.metadata = { pausedReason: meta.pausedReason };
  }

  // 4. Write to AgentTask — compare-and-swap on the status read in step 1.
  // If a concurrent transition already moved the task, the status filter
  // matches no rows and we report the lost race instead of overwriting it.
  const { data: updated, error: updateError } = await supabase
    .from('AgentTask')
    .update(update)
    .eq('id', taskId)
    .eq('status', current)
    .select('id');

  if (updateError) {
    return { ok: false, error: updateError.message };
  }
  if (!updated || updated.length === 0) {
    return { ok: false, error: 'invalid_transition' };
  }

  return { ok: true };
}

// ── Enqueue ───────────────────────────────────────────────────────────────────

/**
 * Inserts a new AgentTask with status 'queued' and returns its id.
 * Throws on DB error — callers handle it.
 */
export async function enqueueTask(
  spaceId: string,
  input: {
    title: string;
    description?: string;
    triggerSource?: string;
    goalDescription?: string;
    parentTaskId?: string;
    totalSteps?: number;
  },
): Promise<string> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('AgentTask')
    .insert({
      spaceId,
      title:           input.title,
      description:     input.description     ?? null,
      triggerSource:   input.triggerSource   ?? 'manual',
      goalDescription: input.goalDescription ?? null,
      parentTaskId:    input.parentTaskId    ?? null,
      totalSteps:      input.totalSteps      ?? 0,
      status:          'queued' satisfies TaskStatus,
      createdAt:       now,
      updatedAt:       now,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to enqueue AgentTask');
  }

  return data.id as string;
}
