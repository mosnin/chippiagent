/**
 * E2E integration tests for the approval flow.
 *
 * Tests the GET and POST /api/agent/approvals route handlers end-to-end:
 *   - GET: surfaces paused tasks with approvalRequired metadata
 *   - POST approve: transitions paused → queued, stamps approvedAt + approvedBy
 *   - POST reject: transitions paused → cancelled, stamps rejectedAt + rejectedBy + rejectionReason
 *   - Auth: wrong user gets 403/404
 *
 * Mock strategy:
 *   - @/lib/api-auth       → vi.mock: controls requireAuth() return value
 *   - @/lib/space          → vi.mock: controls getSpaceForUser() return value
 *   - @/lib/supabase       → queue-based chainable mock (same pattern as task-state-machine tests)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ── Supabase queue-based mock ─────────────────────────────────────────────────

type TerminalResult = { data?: unknown; error?: unknown };
let supabaseQueue: TerminalResult[] = [];

function makeChain(): Record<string, unknown> {
  const terminal: TerminalResult = supabaseQueue.shift() ?? { data: null, error: null };

  const chain: Record<string, unknown> = {};
  const passthroughs = [
    'select', 'eq', 'update', 'insert', 'limit', 'order', 'not', 'in',
  ];
  for (const method of passthroughs) {
    chain[method] = vi.fn((..._args: unknown[]) => chain);
  }

  chain.single = vi.fn(() => Promise.resolve(terminal));
  chain.maybeSingle = vi.fn(() => Promise.resolve(terminal));
  chain.then = (
    resolve: (v: TerminalResult) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(terminal).then(resolve, reject);

  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((_table: string) => makeChain()),
  },
}));

// ── Auth mock ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}));

// ── Space mock ────────────────────────────────────────────────────────────────

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
}));

// ── Kill-switch mock ──────────────────────────────────────────────────────────
// The route gates on `assertSpaceEnabled` (added in the agent-trigger work);
// we no-op it for the happy path. The "space is disabled" failure mode is
// covered by checking the route's gate logic in dedicated kill-switch tests,
// not here.

vi.mock('@/lib/agent/kill-switch', () => ({
  assertSpaceEnabled: vi.fn(async () => undefined),
}));

// Import AFTER all mocks are registered.
import { GET, POST } from '@/app/api/agent/approvals/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import type { Space } from '@/lib/types';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SPACE_ID = 'space-approval-001';
const USER_ID = 'user_approver_abc';

const fakeSpace = {
  id: SPACE_ID,
  slug: 'approval-space',
  name: 'Approval Space',
  ownerId: USER_ID,
} as unknown as Space;

/** A minimal paused task with approvalRequired set in metadata */
const fakePausedTask = {
  id: 'task-paused-001',
  spaceId: SPACE_ID,
  status: 'paused',
  title: 'Send offer to Maria',
  metadata: {
    approvalRequired: true,
    pendingAction: 'send_email',
  },
  createdAt: '2026-05-06T09:00:00.000Z',
  updatedAt: '2026-05-06T09:00:00.000Z',
};

// ── Request helpers ───────────────────────────────────────────────────────────

function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/agent/approvals', { method: 'GET' });
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/agent/approvals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Setup ────────────────────────────────────────────────────────────────────

function queue(...results: TerminalResult[]) {
  supabaseQueue.push(...results);
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseQueue = [];
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/agent/approvals — pending approval detection
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/agent/approvals', () => {
  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it('returns 403 when user has no space', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(null as never);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('identifies tasks with approvalRequired metadata as pending approvals', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);

    // The route queries paused tasks with approvalRequired not null
    queue({ data: [fakePausedTask], error: null });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].id).toBe('task-paused-001');
    expect(body.tasks[0].status).toBe('paused');
    expect(body.tasks[0].metadata.approvalRequired).toBe(true);
    expect(body.tasks[0].metadata.pendingAction).toBe('send_email');
  });

  it('returns empty array when no tasks are pending approval', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);
    queue({ data: [], error: null });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasks).toEqual([]);
  });

  it('returns 500 when DB query fails', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);
    queue({ data: null, error: { message: 'DB unavailable' } });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to fetch/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agent/approvals — approve action
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/agent/approvals — approve', () => {
  it('transitions paused task to queued on approval', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);

    // Route fetches the task via maybeSingle
    queue({ data: fakePausedTask, error: null });

    // Route updates: status=queued, patches metadata
    const updatedTask = {
      ...fakePausedTask,
      status: 'queued',
      metadata: {
        ...fakePausedTask.metadata,
        approvedAt: '2026-05-06T10:00:00.000Z',
        approvedBy: USER_ID,
      },
    };
    queue({ data: updatedTask, error: null });

    const res = await POST(
      makePostRequest({ taskId: 'task-paused-001', action: 'approve' }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.status).toBe('queued');
    expect(body.task.metadata.approvedBy).toBe(USER_ID);
    expect(body.task.metadata.approvedAt).toBeTruthy();
  });

  it('returns 400 when taskId is missing', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);

    const res = await POST(makePostRequest({ action: 'approve' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/taskId/i);
  });

  it('returns 400 when action is invalid', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);

    const res = await POST(
      makePostRequest({ taskId: 'task-paused-001', action: 'invalidaction' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/approve.*reject/i);
  });

  it('returns 404 when task does not exist', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);

    // maybeSingle returns null → task not found
    queue({ data: null, error: null });

    const res = await POST(
      makePostRequest({ taskId: 'task-nonexistent', action: 'approve' }),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it('prevents approval of task belonging to a different space (403)', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    // User's space is different from the task's spaceId
    mockGetSpaceForUser.mockResolvedValue({ ...fakeSpace, id: 'space-other-999' } as never);

    // Task belongs to SPACE_ID, but the user's space is space-other-999
    queue({ data: fakePausedTask, error: null });

    const res = await POST(
      makePostRequest({ taskId: 'task-paused-001', action: 'approve' }),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('returns 409 when task is not in paused status', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);

    // Task is already completed — not paused
    queue({ data: { ...fakePausedTask, status: 'completed' }, error: null });

    const res = await POST(
      makePostRequest({ taskId: 'task-paused-001', action: 'approve' }),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/not awaiting approval/i);
  });

  it('returns 500 when the DB update fails during approval', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);

    queue({ data: fakePausedTask, error: null });      // fetch succeeds
    queue({ data: null, error: { message: 'write conflict' } }); // update fails

    const res = await POST(
      makePostRequest({ taskId: 'task-paused-001', action: 'approve' }),
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to update/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agent/approvals — reject action
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/agent/approvals — reject', () => {
  it('transitions paused task to cancelled on rejection', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);

    queue({ data: fakePausedTask, error: null });

    const updatedTask = {
      ...fakePausedTask,
      status: 'cancelled',
      metadata: {
        ...fakePausedTask.metadata,
        rejectedAt: '2026-05-06T10:00:00.000Z',
        rejectedBy: USER_ID,
        rejectionReason: 'Too risky at this price',
      },
    };
    queue({ data: updatedTask, error: null });

    const res = await POST(
      makePostRequest({
        taskId: 'task-paused-001',
        action: 'reject',
        reason: 'Too risky at this price',
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.status).toBe('cancelled');
    expect(body.task.metadata.rejectedBy).toBe(USER_ID);
    expect(body.task.metadata.rejectedAt).toBeTruthy();
    expect(body.task.metadata.rejectionReason).toBe('Too risky at this price');
  });

  it('rejection without a reason still succeeds (reason is optional)', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);

    queue({ data: fakePausedTask, error: null });

    const updatedTask = {
      ...fakePausedTask,
      status: 'cancelled',
      metadata: {
        ...fakePausedTask.metadata,
        rejectedAt: '2026-05-06T10:00:00.000Z',
        rejectedBy: USER_ID,
      },
    };
    queue({ data: updatedTask, error: null });

    const res = await POST(
      makePostRequest({ taskId: 'task-paused-001', action: 'reject' }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.status).toBe('cancelled');
    expect(body.task.metadata.rejectionReason).toBeUndefined();
  });

  it('prevents rejection of task belonging to a different space (403)', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue({ ...fakeSpace, id: 'space-other-999' } as never);

    // Task belongs to SPACE_ID; user's space is space-other-999
    queue({ data: fakePausedTask, error: null });

    const res = await POST(
      makePostRequest({ taskId: 'task-paused-001', action: 'reject' }),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );

    const res = await POST(
      makePostRequest({ taskId: 'task-paused-001', action: 'reject' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when JSON body is malformed', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);

    const req = new NextRequest('http://localhost/api/agent/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-valid-json{{{',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid json/i);
  });
});
