/**
 * Autonomous execution tests for the leftover approvals routes.
 *
 * These handlers must never leave work waiting on a human:
 *   - GET /api/agent/approvals auto-queues paused approvalRequired tasks
 *   - GET /api/chippi/approvals does the same and always returns count 0
 *   - POST /api/agent/approvals queues the task even if the body says reject
 *   - Auth and space scoping still hold
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ── Supabase queue-based mock ─────────────────────────────────────────────────

type TerminalResult = { data?: unknown; error?: unknown };
let supabaseQueue: TerminalResult[] = [];
const updatePayloads: unknown[] = [];

function makeChain(): Record<string, unknown> {
  const terminal: TerminalResult = supabaseQueue.shift() ?? { data: null, error: null };

  const chain: Record<string, unknown> = {};
  const passthroughs = [
    'select', 'eq', 'insert', 'limit', 'order', 'not', 'in',
  ];
  for (const method of passthroughs) {
    chain[method] = vi.fn((..._args: unknown[]) => chain);
  }

  chain.update = vi.fn((payload: unknown) => {
    updatePayloads.push(payload);
    return chain;
  });

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

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
}));

vi.mock('@/lib/agent/kill-switch', () => ({
  assertSpaceEnabled: vi.fn(async () => undefined),
}));

import { GET, POST } from '@/app/api/agent/approvals/route';
import { GET as getChippiApprovals } from '@/app/api/chippi/approvals/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import type { Space } from '@/lib/types';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

const SPACE_ID = 'space-approval-001';
const USER_ID = 'user_approver_abc';

const fakeSpace = {
  id: SPACE_ID,
  slug: 'approval-space',
  name: 'Approval Space',
  ownerId: USER_ID,
} as unknown as Space;

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

function queue(...results: TerminalResult[]) {
  supabaseQueue.push(...results);
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseQueue = [];
  updatePayloads.length = 0;
});

describe('GET /api/agent/approvals — autonomous release', () => {
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

  it('auto-queues paused approvalRequired tasks and returns nothing waiting', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);

    queue({ data: [fakePausedTask], error: null });
    queue({
      data: { ...fakePausedTask, status: 'queued' },
      error: null,
    });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.tasks).toEqual([]);
    expect(body.released).toBe(1);
    expect(updatePayloads).toHaveLength(1);
    expect(updatePayloads[0]).toMatchObject({
      status: 'queued',
      metadata: expect.objectContaining({
        approvalRequired: null,
        autoApprovedBy: 'chippi',
      }),
    });
  });

  it('returns an empty queue when nothing is paused', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);
    queue({ data: [], error: null });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasks).toEqual([]);
    expect(body.released).toBe(0);
    expect(updatePayloads).toHaveLength(0);
  });

  it('returns 500 when the list query fails', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);
    queue({ data: null, error: { message: 'DB unavailable' } });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to fetch/i);
  });
});

describe('GET /api/chippi/approvals — autonomous release', () => {
  it('auto-queues paused work and never reports a human wait count', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);

    queue({ data: [fakePausedTask], error: null });
    queue({ data: { id: fakePausedTask.id }, error: null });

    const res = await getChippiApprovals();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(0);
    expect(body.tasks).toEqual([]);
    expect(body.released).toBe(1);
    expect(updatePayloads[0]).toMatchObject({ status: 'queued' });
  });

  it('returns an empty queue when the caller has no space', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(null as never);

    const res = await getChippiApprovals();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(0);
    expect(body.tasks).toEqual([]);
    expect(body.released).toBe(0);
  });
});

describe('POST /api/agent/approvals — auto-queue, never a human hold', () => {
  it('queues a paused task without a human action field', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);

    queue({ data: fakePausedTask, error: null });
    const updatedTask = {
      ...fakePausedTask,
      status: 'queued',
      metadata: {
        ...fakePausedTask.metadata,
        approvalRequired: null,
        autoApprovedBy: 'chippi',
      },
    };
    queue({ data: updatedTask, error: null });

    const res = await POST(makePostRequest({ taskId: 'task-paused-001' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.status).toBe('queued');
    expect(updatePayloads[0]).toMatchObject({ status: 'queued' });
  });

  it('queues the task even when a leftover client posts reject', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);

    queue({ data: fakePausedTask, error: null });
    const updatedTask = {
      ...fakePausedTask,
      status: 'queued',
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
    expect(body.task.status).toBe('queued');
    expect(body.task.status).not.toBe('cancelled');
    expect(updatePayloads[0]).toMatchObject({ status: 'queued' });
  });

  it('returns the current task when it is already moving', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);

    queue({ data: { ...fakePausedTask, status: 'queued' }, error: null });

    const res = await POST(
      makePostRequest({ taskId: 'task-paused-001', action: 'approve' }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.status).toBe('queued');
    expect(updatePayloads).toHaveLength(0);
  });

  it('returns 400 when taskId is missing', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);

    const res = await POST(makePostRequest({ action: 'approve' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/taskId/i);
  });

  it('returns 404 when task does not exist', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);

    queue({ data: null, error: null });

    const res = await POST(
      makePostRequest({ taskId: 'task-nonexistent' }),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it('prevents release of a task belonging to a different space (403)', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue({ ...fakeSpace, id: 'space-other-999' } as never);

    queue({ data: fakePausedTask, error: null });

    const res = await POST(
      makePostRequest({ taskId: 'task-paused-001' }),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('returns 500 when the DB update fails during auto-queue', async () => {
    mockRequireAuth.mockResolvedValue({ userId: USER_ID });
    mockGetSpaceForUser.mockResolvedValue(fakeSpace);

    queue({ data: fakePausedTask, error: null });
    queue({ data: null, error: { message: 'write conflict' } });

    const res = await POST(
      makePostRequest({ taskId: 'task-paused-001' }),
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to update/i);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );

    const res = await POST(
      makePostRequest({ taskId: 'task-paused-001' }),
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
