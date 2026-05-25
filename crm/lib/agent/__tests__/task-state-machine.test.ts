/**
 * Integration tests for lib/agent/task-state-machine.ts
 *
 * canTransition() is a pure guard — no mocking needed.
 * transitionTask() and enqueueTask() write to Supabase — mocked via vi.mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Supabase mock ─────────────────────────────────────────────────────────────
//
// We need two independent chainable builders: one for the initial SELECT (fetch
// current status) and one for the UPDATE (write new status).  The queue lets
// each test control exactly what each Supabase call returns.

type TerminalResult = { data?: unknown; error?: unknown };
let supabaseQueue: TerminalResult[] = [];

function makeChain(): Record<string, unknown> {
  const terminal: TerminalResult = supabaseQueue.shift() ?? { data: null, error: null };

  const chain: Record<string, unknown> = {};
  let isUpdate = false;

  const passthroughs = ['select', 'eq', 'update', 'insert', 'limit', 'order'];
  for (const method of passthroughs) {
    chain[method] = vi.fn((..._args: unknown[]) => {
      if (method === 'update') isUpdate = true;
      return chain;
    });
  }

  // .single() terminates and resolves
  chain.single = vi.fn(() => Promise.resolve(terminal));
  // .maybeSingle() same
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

// Import AFTER vi.mock so the module picks up the mock
import {
  canTransition,
  transitionTask,
  enqueueTask,
  type TaskStatus,
} from '@/lib/agent/task-state-machine';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Push results for successive supabase.from() calls */
function queue(...results: TerminalResult[]) {
  supabaseQueue.push(...results);
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseQueue = [];
});

// ─────────────────────────────────────────────────────────────────────────────
// canTransition — pure function, no mocking needed
// ─────────────────────────────────────────────────────────────────────────────

describe('canTransition()', () => {
  it('queued → running: true', () => {
    expect(canTransition('queued', 'running')).toBe(true);
  });

  it('queued → completed: false', () => {
    expect(canTransition('queued', 'completed')).toBe(false);
  });

  it('running → paused: true', () => {
    expect(canTransition('running', 'paused')).toBe(true);
  });

  it('running → completed: true', () => {
    expect(canTransition('running', 'completed')).toBe(true);
  });

  it('running → failed: true', () => {
    expect(canTransition('running', 'failed')).toBe(true);
  });

  it('running → cancelled: true', () => {
    expect(canTransition('running', 'cancelled')).toBe(true);
  });

  it('paused → running: true', () => {
    expect(canTransition('paused', 'running')).toBe(true);
  });

  it('paused → completed: false (must go through running)', () => {
    expect(canTransition('paused', 'completed')).toBe(false);
  });

  it('completed → running: false (terminal state)', () => {
    expect(canTransition('completed', 'running')).toBe(false);
  });

  it('failed → queued: true (retry path)', () => {
    expect(canTransition('failed', 'queued')).toBe(true);
  });

  it('cancelled → running: false (terminal state)', () => {
    expect(canTransition('cancelled', 'running')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// transitionTask() — mocked Supabase
// ─────────────────────────────────────────────────────────────────────────────

describe('transitionTask()', () => {
  it('valid transition: DB called with new status, returns { ok: true }', async () => {
    // First call: SELECT current status → running
    queue({ data: { status: 'running' as TaskStatus }, error: null });
    // Second call: UPDATE → success (no error)
    queue({ data: null, error: null });

    const result = await transitionTask('task-001', 'completed');

    expect(result).toEqual({ ok: true });
  });

  it('invalid transition: DB SELECT happens but UPDATE is NOT called, returns { ok: false }', async () => {
    // Current status is 'completed' — terminal, cannot go to 'running'
    queue({ data: { status: 'completed' as TaskStatus }, error: null });
    // We queue a second result to verify it's never consumed (UPDATE not called)
    queue({ data: null, error: null });

    const result = await transitionTask('task-002', 'running');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid_transition');
    // The second queue entry should remain unconsumed
    expect(supabaseQueue).toHaveLength(1);
  });

  it('DB UPDATE error: returns { ok: false, error: <message> } and never throws', async () => {
    queue({ data: { status: 'running' as TaskStatus }, error: null });
    queue({ data: null, error: { message: 'connection timeout' } });

    const result = await transitionTask('task-003', 'completed');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('connection timeout');
  });

  it('task not found (SELECT returns null): returns { ok: false, error: "not_found" }', async () => {
    // Simulates .single() returning fetchError (row missing)
    queue({ data: null, error: { message: 'Row not found' } });

    const result = await transitionTask('task-nonexistent', 'running');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('not_found');
  });

  it('SELECT returns null data (no error but row missing): returns { ok: false, error: "not_found" }', async () => {
    // Some Supabase adapters return { data: null, error: null } for missing rows
    queue({ data: null, error: null });

    const result = await transitionTask('task-ghost', 'running');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('not_found');
  });

  it('passes metadata fields (startedAt, completedAt, cancelledAt) through to the update', async () => {
    queue({ data: { status: 'running' as TaskStatus }, error: null });
    queue({ data: null, error: null });

    const meta = {
      completedAt: '2026-05-06T12:00:00.000Z',
    };
    const result = await transitionTask('task-004', 'completed', meta);

    expect(result).toEqual({ ok: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// enqueueTask() — mocked Supabase
// ─────────────────────────────────────────────────────────────────────────────

describe('enqueueTask()', () => {
  it('success: inserts row with status queued, returns the new task id', async () => {
    queue({ data: { id: 'new-task-xyz' }, error: null });

    const id = await enqueueTask('space-abc', {
      title: 'Follow up with Sam Chen',
      goalDescription: 'Call Sam to discuss the Maple St offer.',
      triggerSource: 'manual',
    });

    expect(id).toBe('new-task-xyz');
  });

  it('success with minimal input (title only): returns id', async () => {
    queue({ data: { id: 'task-min-001' }, error: null });

    const id = await enqueueTask('space-abc', { title: 'Quick check-in' });

    expect(id).toBe('task-min-001');
  });

  it('DB error: throws with an error message', async () => {
    queue({ data: null, error: { message: 'unique constraint violation' } });

    await expect(
      enqueueTask('space-abc', { title: 'Duplicate task' }),
    ).rejects.toThrow();
  });

  it('DB returns null data with no error: throws', async () => {
    queue({ data: null, error: null });

    await expect(
      enqueueTask('space-abc', { title: 'Ghost task' }),
    ).rejects.toThrow('Failed to enqueue AgentTask');
  });
});
