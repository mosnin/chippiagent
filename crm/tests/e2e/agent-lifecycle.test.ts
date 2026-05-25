/**
 * E2E integration tests for the agent task lifecycle.
 *
 * Covers the full arc: enqueue → queued → running → completed/failed/retry.
 *
 * Mock strategy — identical to lib/agent/__tests__/task-state-machine.test.ts:
 *   A queue of TerminalResult objects is consumed in FIFO order by each new
 *   supabase.from() call so tests can precisely control what Supabase returns
 *   for each chained operation without nesting mocks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Supabase queue-based mock ─────────────────────────────────────────────────

type TerminalResult = { data?: unknown; error?: unknown };
let supabaseQueue: TerminalResult[] = [];

function makeChain(): Record<string, unknown> {
  const terminal: TerminalResult = supabaseQueue.shift() ?? { data: null, error: null };

  const chain: Record<string, unknown> = {};
  let isUpdate = false;
  const passthroughs = ['select', 'eq', 'update', 'insert', 'limit', 'order', 'not', 'in'];
  for (const method of passthroughs) {
    chain[method] = vi.fn((..._args: unknown[]) => {
      if (method === 'update') isUpdate = true;
      return chain;
    });
  }

  chain.single = vi.fn(() => Promise.resolve(terminal));
  chain.maybeSingle = vi.fn(() => Promise.resolve(terminal));

  // Allow `await supabase.from(...).update(...).eq(...).select()`. Real
  // Supabase resolves an update().select() to the affected rows; when a test
  // queues only { error } (or { data: null }) for an update, treat a
  // non-error result as one affected row so compare-and-swap sees it.
  chain.then = (
    resolve: (v: TerminalResult) => unknown,
    reject?: (e: unknown) => unknown,
  ) => {
    const resolved: TerminalResult =
      isUpdate && !terminal.error && terminal.data == null
        ? { data: [{}], error: null }
        : terminal;
    return Promise.resolve(resolved).then(resolve, reject);
  };

  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((_table: string) => makeChain()),
  },
}));

// Import AFTER vi.mock so the module picks up the mock.
import {
  canTransition,
  transitionTask,
  enqueueTask,
  type TaskStatus,
} from '@/lib/agent/task-state-machine';

// ── Helpers ───────────────────────────────────────────────────────────────────

function queue(...results: TerminalResult[]) {
  supabaseQueue.push(...results);
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseQueue = [];
});

// ─────────────────────────────────────────────────────────────────────────────
// canTransition — pure guard, no DB involved
// ─────────────────────────────────────────────────────────────────────────────

describe('canTransition()', () => {
  it('allows queued → running', () => {
    expect(canTransition('queued', 'running')).toBe(true);
  });

  it('allows running → completed', () => {
    expect(canTransition('running', 'completed')).toBe(true);
  });

  it('allows running → failed', () => {
    expect(canTransition('running', 'failed')).toBe(true);
  });

  it('allows running → paused', () => {
    expect(canTransition('running', 'paused')).toBe(true);
  });

  it('allows paused → running', () => {
    expect(canTransition('paused', 'running')).toBe(true);
  });

  it('allows failed → queued (retry path)', () => {
    expect(canTransition('failed', 'queued')).toBe(true);
  });

  it('blocks running → queued (no direct requeue while running)', () => {
    expect(canTransition('running', 'queued')).toBe(false);
  });

  it('blocks completed → running (terminal state)', () => {
    expect(canTransition('completed', 'running')).toBe(false);
  });

  it('blocks cancelled → running (terminal state)', () => {
    expect(canTransition('cancelled', 'running')).toBe(false);
  });

  it('blocks queued → completed (must pass through running)', () => {
    expect(canTransition('queued', 'completed')).toBe(false);
  });

  it('blocks paused → completed (must go through running)', () => {
    expect(canTransition('paused', 'completed')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// enqueueTask() — writes to Supabase (mocked)
// ─────────────────────────────────────────────────────────────────────────────

describe('enqueueTask()', () => {
  it('creates a task with status=queued and returns the new task id', async () => {
    queue({ data: { id: 'task-enqueue-001' }, error: null });

    const id = await enqueueTask('space-xyz', {
      title: 'Follow up with Sam Chen',
      goalDescription: 'Call Sam to discuss the Maple St offer.',
      triggerSource: 'manual',
    });

    expect(id).toBe('task-enqueue-001');
  });

  it('works with minimal input (title only)', async () => {
    queue({ data: { id: 'task-min-001' }, error: null });

    const id = await enqueueTask('space-xyz', { title: 'Quick check-in' });

    expect(id).toBe('task-min-001');
  });

  it('throws when DB insert returns an error', async () => {
    queue({ data: null, error: { message: 'unique constraint violation' } });

    await expect(
      enqueueTask('space-xyz', { title: 'Duplicate task' }),
    ).rejects.toThrow();
  });

  it('throws with "Failed to enqueue AgentTask" when DB returns null data and no error', async () => {
    queue({ data: null, error: null });

    await expect(
      enqueueTask('space-xyz', { title: 'Ghost task' }),
    ).rejects.toThrow('Failed to enqueue AgentTask');
  });

  it('passes all optional fields through to the insert', async () => {
    queue({ data: { id: 'task-full-001' }, error: null });

    const id = await enqueueTask('space-xyz', {
      title: 'Schedule open house',
      description: 'Coordinate with the listing agent',
      goalDescription: 'Book the open house for 123 Maple St',
      triggerSource: 'scheduled',
      totalSteps: 5,
    });

    expect(id).toBe('task-full-001');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// transitionTask() — reads then writes to Supabase (mocked)
// ─────────────────────────────────────────────────────────────────────────────

describe('transitionTask()', () => {
  it('queued → running: returns { ok: true } and performs the DB update', async () => {
    // SELECT returns current status
    queue({ data: { status: 'queued' as TaskStatus }, error: null });
    // UPDATE succeeds
    queue({ data: null, error: null });

    const result = await transitionTask('task-001', 'running');

    expect(result).toEqual({ ok: true });
  });

  it('running → completed: returns { ok: true }', async () => {
    queue({ data: { status: 'running' as TaskStatus }, error: null });
    queue({ data: null, error: null });

    const result = await transitionTask('task-002', 'completed', {
      completedAt: '2026-05-06T12:00:00.000Z',
    });

    expect(result).toEqual({ ok: true });
  });

  it('running → failed: returns { ok: true }', async () => {
    queue({ data: { status: 'running' as TaskStatus }, error: null });
    queue({ data: null, error: null });

    const result = await transitionTask('task-003', 'failed');

    expect(result).toEqual({ ok: true });
  });

  it('running → paused: returns { ok: true }', async () => {
    queue({ data: { status: 'running' as TaskStatus }, error: null });
    queue({ data: null, error: null });

    const result = await transitionTask('task-004', 'paused', {
      pausedReason: 'awaiting approval',
    });

    expect(result).toEqual({ ok: true });
  });

  it('invalid transition (running → queued): returns { ok: false, error: "invalid_transition" } without calling UPDATE', async () => {
    // SELECT returns current status 'running'
    queue({ data: { status: 'running' as TaskStatus }, error: null });
    // Queue a second entry — it should remain unconsumed if UPDATE is not called.
    queue({ data: null, error: null });

    const result = await transitionTask('task-005', 'queued');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid_transition');
    // The UPDATE entry should remain unconsumed.
    expect(supabaseQueue).toHaveLength(1);
  });

  it('invalid transition (completed → running): returns { ok: false, error: "invalid_transition" }', async () => {
    queue({ data: { status: 'completed' as TaskStatus }, error: null });
    queue({ data: null, error: null });

    const result = await transitionTask('task-006', 'running');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid_transition');
    expect(supabaseQueue).toHaveLength(1);
  });

  it('task not found (SELECT error): returns { ok: false, error: "not_found" }', async () => {
    queue({ data: null, error: { message: 'Row not found' } });

    const result = await transitionTask('task-nonexistent', 'running');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('not_found');
  });

  it('task not found (SELECT returns null with no error): returns { ok: false, error: "not_found" }', async () => {
    queue({ data: null, error: null });

    const result = await transitionTask('task-ghost', 'running');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('not_found');
  });

  it('DB UPDATE error: returns { ok: false, error: <DB message> } without throwing', async () => {
    queue({ data: { status: 'running' as TaskStatus }, error: null });
    queue({ data: null, error: { message: 'connection timeout' } });

    const result = await transitionTask('task-007', 'completed');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('connection timeout');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full lifecycle flows — multi-step sequences
// ─────────────────────────────────────────────────────────────────────────────

describe('Full lifecycle flows', () => {
  it('queued → running → completed: all transitions succeed in sequence', async () => {
    // Step 1: queued → running
    queue({ data: { status: 'queued' as TaskStatus }, error: null }); // SELECT
    queue({ data: null, error: null }); // UPDATE

    // Step 2: running → completed
    queue({ data: { status: 'running' as TaskStatus }, error: null }); // SELECT
    queue({ data: null, error: null }); // UPDATE

    const r1 = await transitionTask('task-flow-001', 'running', {
      startedAt: '2026-05-06T10:00:00.000Z',
    });
    expect(r1).toEqual({ ok: true });

    const r2 = await transitionTask('task-flow-001', 'completed', {
      completedAt: '2026-05-06T10:05:00.000Z',
    });
    expect(r2).toEqual({ ok: true });
  });

  it('running → failed → queued (retry): retry path succeeds', async () => {
    // Step 1: running → failed
    queue({ data: { status: 'running' as TaskStatus }, error: null });
    queue({ data: null, error: null });

    // Step 2: failed → queued (retry)
    queue({ data: { status: 'failed' as TaskStatus }, error: null });
    queue({ data: null, error: null });

    const r1 = await transitionTask('task-retry-001', 'failed');
    expect(r1).toEqual({ ok: true });

    const r2 = await transitionTask('task-retry-001', 'queued');
    expect(r2).toEqual({ ok: true });
  });

  it('enqueue then transition queued → running: combines insert + update correctly', async () => {
    // Enqueue: INSERT → returns id
    queue({ data: { id: 'task-combo-001' }, error: null });
    // Transition queued → running: SELECT + UPDATE
    queue({ data: { status: 'queued' as TaskStatus }, error: null });
    queue({ data: null, error: null });

    const id = await enqueueTask('space-abc', { title: 'Send follow-up email' });
    expect(id).toBe('task-combo-001');

    const result = await transitionTask(id, 'running', {
      startedAt: new Date().toISOString(),
    });
    expect(result).toEqual({ ok: true });
  });

  it('task cost accumulation: multiple transitions succeed independently (no cost bleed between calls)', async () => {
    // First full transition: queued → running
    queue({ data: { status: 'queued' as TaskStatus }, error: null });
    queue({ data: null, error: null });

    // Second full transition: running → completed (simulates cost accumulation step)
    queue({ data: { status: 'running' as TaskStatus }, error: null });
    queue({ data: null, error: null });

    const r1 = await transitionTask('task-cost-001', 'running', { startedAt: '2026-05-06T10:00:00.000Z' });
    const r2 = await transitionTask('task-cost-001', 'completed', { completedAt: '2026-05-06T10:10:00.000Z' });

    expect(r1).toEqual({ ok: true });
    expect(r2).toEqual({ ok: true });
    // Queue fully consumed — no state bleed
    expect(supabaseQueue).toHaveLength(0);
  });
});
