/**
 * Route-level integration test for `POST /api/ai/task` — the runtime
 * branch.
 *
 * The bar:
 *   - When CHIPPI_CHAT_RUNTIME is unset/empty/anything-other-than-ts,
 *     the route MUST proxy to Modal (existing path) — verifying we
 *     didn't break the chat by adding the new code path.
 *   - When CHIPPI_CHAT_RUNTIME=ts, the route MUST call the new TS
 *     streamer instead of touching Modal.
 *   - Auth + space resolution + user-message persistence happen on
 *     BOTH paths, so we don't write them twice.
 *
 * What we DON'T test here: the actual SSE event content. That lives in
 * the sdk-event-mapper test (events) and the sdk-chat-stream module
 * (orchestration). Here we just verify the route picks the right branch.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ── Mocks (must be declared before importing the route) ─────────────────

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'user_clerk_123' })),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 99 })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

// Persistence is mocked so we don't hit Supabase. The route awaits
// saveUserMessage + saveAssistantMessage; both resolve.
vi.mock('@/lib/ai-tools/persistence', () => ({
  saveUserMessage: vi.fn(async () => ({ messageId: 'msg_user_1' })),
  saveAssistantMessage: vi.fn(async () => ({ messageId: 'msg_asst_1' })),
}));

// Telemetry — fire-and-forget; just no-op everything.
vi.mock('@/lib/telemetry', () => ({
  emit: vi.fn(async () => {}),
  hasEmitted: vi.fn(async () => true), // skip the first-message emission
  getFirstEmittedAt: vi.fn(async () => null),
  secondsBetween: vi.fn(() => 0),
  maybeEmitFirstAction: vi.fn(async () => {}),
}));

// Supabase: minimal chainable mock for resolveConversation + loadHistory +
// hydrateAttachments. The route also reads the User row inside
// resolveToolContext → we mock that via the context module instead.
vi.mock('@/lib/supabase', () => {
  // Default `data: []` so the route's loadHistory + hydrateAttachments
  // path treats every read as "no rows" without throwing on .filter().
  function chain(terminal: { data?: unknown; error?: unknown } = { data: [] }) {
    const obj: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'in', 'insert', 'update']) {
      obj[m] = vi.fn(() => obj);
    }
    obj.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: { id: 's_1', slug: 'jane', name: 'Jane', ownerId: 'u_1' } }),
    );
    obj.single = vi.fn(() => Promise.resolve(terminal));
    (obj as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(terminal).then(resolve);
    return obj;
  }
  return { supabase: { from: vi.fn(() => chain()) } };
});

// resolveToolContext is the heart of auth+space — mock it whole.
vi.mock('@/lib/ai-tools/context', () => ({
  resolveToolContext: vi.fn(async () => ({
    userId: 'user_clerk_123',
    space: { id: 's_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u_1' },
    signal: new AbortController().signal,
  })),
}));

// Stub the TS streamer — we just verify it's called when the flag is on.
// vi.mock factories are hoisted to the top of the module, so any variables
// the factory references must also be hoisted via vi.hoisted.
const { tsStreamMock } = vi.hoisted(() => ({
  tsStreamMock: vi.fn(
    (_input: unknown): Response =>
      new Response(new ReadableStream({ start(c) { c.close(); } }), {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
  ),
}));
vi.mock('@/lib/ai-tools/sdk-chat-stream', () => ({
  streamTsChatTurn: tsStreamMock,
  streamTsResumeTurn: vi.fn(),
}));

// Stub global fetch so the modal path doesn't try to talk to anything.
const fetchMock = vi.fn();

// Import AFTER the mocks.
import { POST } from '@/app/api/ai/task/route';
import { saveUserMessage } from '@/lib/ai-tools/persistence';

const mockedSaveUser = vi.mocked(saveUserMessage);

const ORIGINAL_RUNTIME = process.env.CHIPPI_CHAT_RUNTIME;
const ORIGINAL_MODAL_URL = process.env.MODAL_CHAT_URL;
const ORIGINAL_SECRET = process.env.AGENT_INTERNAL_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  // Restore the saveUserMessage mock implementation after clearAllMocks.
  mockedSaveUser.mockResolvedValue({ messageId: 'msg_user_1' });
  // Default to unset — every test sets explicitly.
  delete process.env.CHIPPI_CHAT_RUNTIME;
  process.env.MODAL_CHAT_URL = 'https://modal.example/chat';
  process.env.AGENT_INTERNAL_SECRET = 'shh';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockResolvedValue(
    new Response(new ReadableStream({ start(c) { c.close(); } }), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  );
});

afterEach(() => {
  if (ORIGINAL_RUNTIME === undefined) delete process.env.CHIPPI_CHAT_RUNTIME;
  else process.env.CHIPPI_CHAT_RUNTIME = ORIGINAL_RUNTIME;
  if (ORIGINAL_MODAL_URL === undefined) delete process.env.MODAL_CHAT_URL;
  else process.env.MODAL_CHAT_URL = ORIGINAL_MODAL_URL;
  if (ORIGINAL_SECRET === undefined) delete process.env.AGENT_INTERNAL_SECRET;
  else process.env.AGENT_INTERNAL_SECRET = ORIGINAL_SECRET;
});

function makeRequest(body: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/ai/task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      spaceSlug: 'jane',
      message: 'hello',
      ...body,
    }),
  }) as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/ai/task — input validation', () => {
  it('400 on missing spaceSlug', async () => {
    const res = await POST(makeRequest({ spaceSlug: '' }));
    expect(res.status).toBe(400);
  });

  it('400 on empty message', async () => {
    const res = await POST(makeRequest({ message: '   ' }));
    expect(res.status).toBe(400);
  });

  it('400 on message too long (>8000 chars)', async () => {
    const res = await POST(makeRequest({ message: 'a'.repeat(8001) }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/ai/task — runtime branch (default = modal)', () => {
  it('routes to Modal when CHIPPI_CHAT_RUNTIME is unset', async () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    process.env.MODAL_CHAT_URL = 'https://modal.example/chat';
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    // Modal path → fetch is hit, the in-process TS streamer is NOT.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tsStreamMock).not.toHaveBeenCalled();
  });

  it('routes to Modal for any value other than the exact string "ts"', async () => {
    process.env.MODAL_CHAT_URL = 'https://modal.example/chat';
    process.env.CHIPPI_CHAT_RUNTIME = 'TS'; // wrong case → still modal
    await POST(makeRequest());
    expect(fetchMock).toHaveBeenCalled();
    expect(tsStreamMock).not.toHaveBeenCalled();

    fetchMock.mockClear();
    tsStreamMock.mockClear();
    process.env.CHIPPI_CHAT_RUNTIME = 'modal';
    await POST(makeRequest());
    expect(fetchMock).toHaveBeenCalled();
    expect(tsStreamMock).not.toHaveBeenCalled();
  });

  it('returns 503 when MODAL_CHAT_URL is not configured', async () => {
    delete process.env.CHIPPI_CHAT_RUNTIME;
    delete process.env.MODAL_CHAT_URL;
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
    expect(tsStreamMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/ai/task — runtime branch (CHIPPI_CHAT_RUNTIME=ts opt-in)', () => {
  it('routes to streamTsChatTurn when the realtor opts in with CHIPPI_CHAT_RUNTIME=ts', async () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'ts';
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(tsStreamMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still saves the user message before branching (shared persistence)', async () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'ts';
    await POST(makeRequest({ message: 'find Jane' }));
    expect(mockedSaveUser).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'find Jane' }),
    );
  });

  it('passes ctx + conversationId + userMessage to the streamer', async () => {
    process.env.CHIPPI_CHAT_RUNTIME = 'ts';
    await POST(makeRequest({ message: 'hi' }));
    const call = tsStreamMock.mock.calls[0]?.[0] as unknown as {
      ctx: { space: { slug: string } };
      userMessage: string;
      conversationId: string;
    };
    expect(call.userMessage).toBe('hi');
    expect(call.ctx.space.slug).toBe('jane');
    expect(typeof call.conversationId).toBe('string');
  });
});
