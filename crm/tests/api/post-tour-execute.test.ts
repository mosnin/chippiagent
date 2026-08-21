/**
 * Route-level test for POST /api/chippi/post-tour/execute.
 *
 * Pins the missed follow-up send: the recorder posts `{ tool, args }`
 * without `integrationToolkit`. GMAIL_SEND_EMAIL must still fire when
 * Gmail is connected.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

const { executeToolMock, executeToolForEntityMock, activeToolkitsMock, composioConfiguredMock } =
  vi.hoisted(() => ({
    executeToolMock: vi.fn(),
    executeToolForEntityMock: vi.fn(),
    activeToolkitsMock: vi.fn(),
    composioConfiguredMock: vi.fn(),
  }));

vi.mock('@/lib/ai-tools/execute', () => ({
  executeTool: executeToolMock,
}));

vi.mock('@/lib/integrations/composio', () => ({
  composioConfigured: composioConfiguredMock,
  executeToolForEntity: executeToolForEntityMock,
}));

vi.mock('@/lib/integrations/connections', () => ({
  activeToolkits: activeToolkitsMock,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST } from '@/app/api/chippi/post-tour/execute/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/chippi/post-tour/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function authAsRealtor() {
  mockRequireAuth.mockResolvedValue({ userId: 'user_1' });
  mockGetSpaceForUser.mockResolvedValue({
    id: 'space_1',
    slug: 's',
    name: 'Test',
    ownerId: 'owner_1',
  } as never);
}

describe('POST /api/chippi/post-tour/execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    composioConfiguredMock.mockReturnValue(true);
    activeToolkitsMock.mockResolvedValue(['gmail']);
    executeToolForEntityMock.mockResolvedValue({ successful: true });
    executeToolMock.mockResolvedValue({
      ok: true,
      result: { summary: 'logged' },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await POST(makeReq({ proposals: [{ tool: 'log_call', args: {} }] }));
    expect(res.status).toBe(401);
  });

  it('sends the Gmail follow-up when the recorder omits integrationToolkit', async () => {
    authAsRealtor();

    const res = await POST(
      makeReq({
        proposals: [
          {
            tool: 'GMAIL_SEND_EMAIL',
            args: { to: 'sam@chen.com', subject: 'Tour follow-up', body: 'How did it feel?' },
          },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(executeToolForEntityMock).toHaveBeenCalledOnce();
    expect(executeToolForEntityMock).toHaveBeenCalledWith({
      entityId: 'user_1',
      slug: 'GMAIL_SEND_EMAIL',
      arguments: { to: 'sam@chen.com', subject: 'Tour follow-up', body: 'How did it feel?' },
    });
    const json = (await res.json()) as { results: Array<{ tool: string; ok: boolean; doneVerb?: string }> };
    expect(json.results).toHaveLength(1);
    expect(json.results[0].ok).toBe(true);
    expect(json.results[0].tool).toBe('GMAIL_SEND_EMAIL');
    expect(json.results[0].doneVerb).toBe('email sent');
  });

  it('does not send when Gmail is no longer connected', async () => {
    authAsRealtor();
    activeToolkitsMock.mockResolvedValue([]);

    const res = await POST(
      makeReq({
        proposals: [{ tool: 'GMAIL_SEND_EMAIL', args: { to: 'sam@chen.com' } }],
      }),
    );

    expect(res.status).toBe(400);
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe('No valid proposals');
  });

  it('still runs native tools alongside a slug-only follow-up send', async () => {
    authAsRealtor();

    const res = await POST(
      makeReq({
        proposals: [
          { tool: 'log_call', args: { personId: 'p1', summary: 'tour' } },
          { tool: 'GMAIL_SEND_EMAIL', args: { to: 'sam@chen.com' } },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(executeToolMock).toHaveBeenCalledOnce();
    expect(executeToolMock).toHaveBeenCalledWith(
      'log_call',
      { personId: 'p1', summary: 'tour' },
      expect.objectContaining({ userId: 'user_1' }),
    );
    expect(executeToolForEntityMock).toHaveBeenCalledOnce();
    const json = (await res.json()) as { results: Array<{ tool: string; ok: boolean }> };
    expect(json.results.map((r) => r.tool)).toEqual(['log_call', 'GMAIL_SEND_EMAIL']);
    expect(json.results.every((r) => r.ok)).toBe(true);
  });
});
