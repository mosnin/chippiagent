/**
 * `POST /api/ai/task/resume/[pausedRunId]` — load AgentPausedRun, apply
 * decision, kick off the resumed stream.
 *
 * The bar:
 *   - Auth required (401 without).
 *   - 404 when the runtime flag is off (the endpoint shouldn't exist
 *     under the modal default).
 *   - 404 when no row.
 *   - 403 when the row belongs to another user.
 *   - 409 when the row is already resumed/cancelled/expired.
 *   - 410 when expiresAt is past.
 *   - Happy path: marks the row resumed, calls streamTsResumeTurn with
 *     the right shape, returns 200 SSE.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'user_clerk_123' })),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 99 })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

const { streamResumeMock } = vi.hoisted(() => ({
  streamResumeMock: vi.fn(
    (_input: unknown): Response =>
      new Response(new ReadableStream({ start(c) { c.close(); } }), {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
  ),
}));
vi.mock('@/lib/ai-tools/sdk-chat-stream', () => ({
  streamTsChatTurn: vi.fn(),
  streamTsResumeTurn: streamResumeMock,
}));

// Per-table queue so we can return different rows for AgentPausedRun
// vs Space. Hoisted because vi.mock factories are pulled to the top.
const { tableQueue, updateMock } = vi.hoisted(() => ({
  tableQueue: {} as Record<string, Array<{ data?: unknown; error?: unknown }>>,
  updateMock: vi.fn(() => Promise.resolve({ data: [{ id: 'run_1' }], error: null })),
}));

vi.mock('@/lib/supabase', () => {
  function chain(table: string) {
    const obj: Record<string, unknown> = {};
    const terminal = tableQueue[table]?.shift() ?? { data: null };
    for (const m of ['select', 'eq', 'order', 'limit', 'in']) {
      obj[m] = vi.fn(() => obj);
    }
    obj.maybeSingle = vi.fn(() => Promise.resolve(terminal));
    obj.single = vi.fn(() => Promise.resolve(terminal));
    obj.update = vi.fn(() => {
      const upd: Record<string, unknown> = {};
      // .update().eq().eq().select() — the compare-and-swap shape. eq()
      // chains; select() resolves to the affected rows via updateMock.
      upd.eq = vi.fn(() => upd);
      upd.select = vi.fn(() => updateMock());
      return upd;
    });
    obj.insert = vi.fn(() => Promise.resolve({ data: null, error: null }));
    (obj as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(terminal).then(resolve);
    return obj;
  }
  return { supabase: { from: vi.fn((table: string) => chain(table)) } };
});

import { POST } from '@/app/api/ai/task/resume/[pausedRunId]/route';
import { requireAuth } from '@/lib/api-auth';

const mockedAuth = vi.mocked(requireAuth);

const ORIGINAL_RUNTIME = process.env.CHIPPI_CHAT_RUNTIME;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CHIPPI_CHAT_RUNTIME = 'ts';
  mockedAuth.mockResolvedValue({ userId: 'user_clerk_123' });
  for (const k of Object.keys(tableQueue)) delete tableQueue[k];
  updateMock.mockResolvedValue({ data: [{ id: 'run_1' }], error: null });
});

afterEach(() => {
  if (ORIGINAL_RUNTIME === undefined) delete process.env.CHIPPI_CHAT_RUNTIME;
  else process.env.CHIPPI_CHAT_RUNTIME = ORIGINAL_RUNTIME;
});

function makeReq(body: Record<string, unknown>) {
  return new Request('http://localhost/api/ai/task/resume/run_1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

const params = (id: string) => ({ params: Promise.resolve({ pausedRunId: id }) });

interface PausedRow {
  id: string;
  spaceId: string;
  userId: string;
  conversationId: string;
  runState: string;
  approvals: Array<{ callId: string; toolName: string; arguments: unknown; summary: string }>;
  status: string;
  expiresAt: string;
}
const ROW: PausedRow = {
  id: 'run_1',
  spaceId: 's_1',
  userId: 'user_clerk_123',
  conversationId: 'conv_1',
  runState: 'serialized-state-blob',
  approvals: [
    { callId: 'call_xyz', toolName: 'send_email', arguments: { to: 'a@b.c' }, summary: 'Email a@b.c' },
  ],
  status: 'pending',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};
const SPACE = { id: 's_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u_1' };

function queueRow(row: PausedRow | null) {
  tableQueue.AgentPausedRun = [{ data: row }];
}
function queueSpace(space: typeof SPACE | null) {
  tableQueue.Space = [{ data: space }];
}

describe('POST /api/ai/task/resume/[pausedRunId] — flag gate', () => {
  it('returns 404 when CHIPPI_CHAT_RUNTIME != "ts"', async () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'modal';
    const res = await POST(makeReq({ approved: true }), params('run_1'));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/ai/task/resume/[pausedRunId] — request shape', () => {
  it('400 on invalid JSON body', async () => {
    const req = new Request('http://localhost/api/ai/task/resume/run_1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    }) as unknown as Parameters<typeof POST>[0];
    const res = await POST(req, params('run_1'));
    expect(res.status).toBe(400);
  });

  it('400 when approved is missing or non-boolean', async () => {
    const res = await POST(makeReq({}), params('run_1'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/ai/task/resume/[pausedRunId] — auth + scoping', () => {
  it('401 when requireAuth fails (returns NextResponse)', async () => {
    const { NextResponse } = await import('next/server');
    mockedAuth.mockResolvedValueOnce(NextResponse.json({ error: 'unauth' }, { status: 401 }));
    const res = await POST(makeReq({ approved: true }), params('run_1'));
    expect(res.status).toBe(401);
  });

  it('404 when the row does not exist', async () => {
    queueRow(null);
    const res = await POST(makeReq({ approved: true }), params('run_1'));
    expect(res.status).toBe(404);
  });

  it('403 when the row belongs to a different user', async () => {
    queueRow({ ...ROW, userId: 'user_other' });
    const res = await POST(makeReq({ approved: true }), params('run_1'));
    expect(res.status).toBe(403);
  });

  it('409 when the row is already resumed', async () => {
    queueRow({ ...ROW, status: 'resumed' });
    const res = await POST(makeReq({ approved: true }), params('run_1'));
    expect(res.status).toBe(409);
  });

  it('410 when the row has expired', async () => {
    queueRow({ ...ROW, expiresAt: new Date(Date.now() - 1000).toISOString() });
    const res = await POST(makeReq({ approved: true }), params('run_1'));
    expect(res.status).toBe(410);
  });

  it('404 when the space row is missing', async () => {
    queueRow(ROW);
    queueSpace(null);
    const res = await POST(makeReq({ approved: true }), params('run_1'));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/ai/task/resume/[pausedRunId] — happy path', () => {
  it('streams the resume turn with the persisted state and decision', async () => {
    queueRow(ROW);
    queueSpace(SPACE);
    const res = await POST(makeReq({ approved: true }), params('run_1'));
    expect(res.status).toBe(200);
    expect(streamResumeMock).toHaveBeenCalledTimes(1);
    const call = streamResumeMock.mock.calls[0]?.[0] as unknown as {
      serializedState: string;
      callId: string;
      decision: { approved: boolean; message?: string };
      ctx: { userId: string; space: { id: string } };
      conversationId: string;
    };
    expect(call.serializedState).toBe('serialized-state-blob');
    expect(call.callId).toBe('call_xyz');
    expect(call.decision).toEqual({ approved: true });
    expect(call.ctx.userId).toBe('user_clerk_123');
    expect(call.ctx.space.id).toBe('s_1');
    expect(call.conversationId).toBe('conv_1');
  });

  it('passes the rejection message through when approved=false', async () => {
    queueRow(ROW);
    queueSpace(SPACE);
    await POST(
      makeReq({ approved: false, message: 'wrong recipient' }),
      params('run_1'),
    );
    const call = streamResumeMock.mock.calls[0]?.[0] as unknown as {
      decision: { approved: boolean; message?: string };
    };
    expect(call.decision).toEqual({ approved: false, message: 'wrong recipient' });
  });

  it('uses the explicit callId when the body provides one (multi-pending case)', async () => {
    queueRow({
      ...ROW,
      approvals: [
        { callId: 'call_first', toolName: 'send_email', arguments: {}, summary: 's1' },
        { callId: 'call_second', toolName: 'send_sms', arguments: {}, summary: 's2' },
      ],
    });
    queueSpace(SPACE);
    await POST(
      makeReq({ approved: true, callId: 'call_second' }),
      params('run_1'),
    );
    const call = streamResumeMock.mock.calls[0]?.[0] as unknown as { callId: string };
    expect(call.callId).toBe('call_second');
  });
});
