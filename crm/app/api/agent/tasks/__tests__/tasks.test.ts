/**
 * Route-level integration tests for GET and POST /api/agent/tasks
 *
 * Mock strategy:
 *   - @/lib/api-auth  → vi.mock: controls requireAuth() return value
 *   - @/lib/space     → vi.mock: controls getSpaceForUser() return value
 *   - @/lib/agent/task-state-machine → vi.mock: controls enqueueTask()
 *   - @/lib/supabase  → chainable thenable mock for supabase.from()
 *
 * Tests are route-handler unit tests: we import GET/POST directly and call
 * them with a constructed NextRequest, then assert on the NextResponse.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ── Supabase chainable mock ───────────────────────────────────────────────────

type TerminalResult = { data?: unknown; error?: unknown };
let supabaseQueue: TerminalResult[] = [];

function makeChain(): Record<string, unknown> {
  const terminal: TerminalResult = supabaseQueue.shift() ?? { data: [], error: null };

  const chain: Record<string, unknown> = {};
  const passthroughs = ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update'];
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
// Every agent route gates on `assertSpaceEnabled`. No-op for the happy path;
// the "space is disabled" failure mode is covered by dedicated tests.

vi.mock('@/lib/agent/kill-switch', () => ({
  assertSpaceEnabled: vi.fn(async () => undefined),
}));

// ── task-state-machine mock (enqueueTask only) ────────────────────────────────

vi.mock('@/lib/agent/task-state-machine', async () => {
  // Re-export the pure functions from the real module; only stub enqueueTask.
  const actual = await vi.importActual<typeof import('@/lib/agent/task-state-machine')>(
    '@/lib/agent/task-state-machine',
  );
  return {
    ...actual,
    enqueueTask: vi.fn(),
  };
});

// ── Import after all mocks are registered ────────────────────────────────────

import { GET, POST } from '@/app/api/agent/tasks/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import type { Space } from '@/lib/types';
import { enqueueTask } from '@/lib/agent/task-state-machine';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);
const mockEnqueueTask = vi.mocked(enqueueTask);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SPACE_ID = 'space-test-001';
const USER_ID = 'user_clerk_abc';

const fakeSpace = {
  id: SPACE_ID,
  slug: 'test-space',
  name: 'Test Space',
  ownerId: USER_ID,
} as unknown as Space;

// ── Request helpers ───────────────────────────────────────────────────────────

function makeGetRequest(spaceId?: string): NextRequest {
  const url = spaceId
    ? `http://localhost/api/agent/tasks?spaceId=${spaceId}`
    : 'http://localhost/api/agent/tasks';
  return new NextRequest(url, { method: 'GET' });
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/agent/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  supabaseQueue = [];
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/agent/tasks
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/agent/tasks', () => {
  it('returns 400 when spaceId query param is missing', async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/spaceId/i);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );

    const res = await GET(makeGetRequest(SPACE_ID));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 403 when spaceId does not belong to the authenticated user', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    // User's space is different from the requested spaceId
    mockGetSpaceForUser.mockResolvedValue({
      ...fakeSpace,
      id: 'space-different-999',
    } as never);

    const res = await GET(makeGetRequest(SPACE_ID));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('returns 200 with tasks array on happy path', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);

    const fakeTasks = [
      { id: 'task-1', status: 'completed', title: 'Call Sam' },
      { id: 'task-2', status: 'queued', title: 'Email Maria' },
    ];
    supabaseQueue.push({ data: fakeTasks, error: null });

    const res = await GET(makeGetRequest(SPACE_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasks).toEqual(fakeTasks);
  });

  it('returns empty array when no tasks exist for the space', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);
    supabaseQueue.push({ data: [], error: null });

    const res = await GET(makeGetRequest(SPACE_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasks).toEqual([]);
  });

  it('returns 500 when the DB query fails', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);
    supabaseQueue.push({ data: null, error: { message: 'DB exploded' } });

    const res = await GET(makeGetRequest(SPACE_ID));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to fetch/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agent/tasks
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/agent/tasks', () => {
  it('returns 400 when spaceId is missing from the body', async () => {
    const res = await POST(makePostRequest({ goal: 'Follow up with Sam' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/spaceId/i);
  });

  it('returns 400 when goal is missing or empty', async () => {
    const res = await POST(makePostRequest({ spaceId: SPACE_ID, goal: '   ' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/goal/i);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );

    const res = await POST(makePostRequest({ spaceId: SPACE_ID, goal: 'Do something' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when spaceId is not owned by the authenticated user', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue({
      ...fakeSpace,
      id: 'space-different-999',
    } as never);

    const res = await POST(
      makePostRequest({ spaceId: SPACE_ID, goal: 'Follow up with Sam' }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('returns 201 with the new task on success', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);
    mockEnqueueTask.mockResolvedValue('new-task-id-123');

    const newTask = {
      id: 'new-task-id-123',
      status: 'queued',
      title: 'Follow up with Sam Chen',
      goalDescription: 'Follow up with Sam Chen',
      createdAt: '2026-05-06T00:00:00.000Z',
    };
    supabaseQueue.push({ data: newTask, error: null });

    const res = await POST(
      makePostRequest({ spaceId: SPACE_ID, goal: 'Follow up with Sam Chen' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.task).toMatchObject({
      id: 'new-task-id-123',
      status: 'queued',
    });

    expect(mockEnqueueTask).toHaveBeenCalledOnce();
    expect(mockEnqueueTask).toHaveBeenCalledWith(
      SPACE_ID,
      expect.objectContaining({
        title: 'Follow up with Sam Chen',
        goalDescription: 'Follow up with Sam Chen',
        triggerSource: 'manual',
      }),
    );
  });

  it('returns 500 when enqueueTask throws', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);
    mockEnqueueTask.mockRejectedValue(new Error('DB write failed'));

    const res = await POST(
      makePostRequest({ spaceId: SPACE_ID, goal: 'Schedule open house' }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to enqueue/i);
  });
});
