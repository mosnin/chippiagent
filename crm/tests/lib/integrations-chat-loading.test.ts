/**
 * Tests for `loadIntegrationTools` in `lib/ai-tools/sdk-chat.ts`.
 *
 * The chat runtime calls this on every turn. The bar is that it MUST
 * NOT crash the chat — Composio outages, missing keys, zero connected
 * apps, all need to return an empty array and let the native tool
 * catalog answer the user. A throw here = chat-down.
 *
 * The implementation builds tools per-toolkit (so a single dead
 * connection doesn't poison the batch) and flips the row to 'expired'
 * on auth-shaped errors. Both behaviors are guarded here. The per-
 * toolkit builder lives in `lib/integrations/agent-tools.ts`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  activeToolkitsMock,
  buildToolkitAgentToolsMock,
  composioConfiguredMock,
  markExpiredByToolkitMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  activeToolkitsMock: vi.fn(),
  buildToolkitAgentToolsMock: vi.fn(),
  composioConfiguredMock: vi.fn(() => true),
  markExpiredByToolkitMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock('@/lib/integrations/connections', () => ({
  activeToolkits: activeToolkitsMock,
  markExpiredByToolkit: markExpiredByToolkitMock,
}));

vi.mock('@/lib/integrations/composio', () => ({
  composioConfigured: composioConfiguredMock,
}));

vi.mock('@/lib/integrations/agent-tools', () => ({
  buildToolkitAgentTools: buildToolkitAgentToolsMock,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: loggerWarnMock, info: vi.fn(), debug: vi.fn() },
}));

import { loadIntegrationTools } from '@/lib/ai-tools/sdk-chat';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'user_clerk_123',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u_db_1' },
    signal: new AbortController().signal,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  composioConfiguredMock.mockReturnValue(true);
  activeToolkitsMock.mockResolvedValue([]);
  buildToolkitAgentToolsMock.mockResolvedValue([]);
  markExpiredByToolkitMock.mockResolvedValue(undefined);
});

describe('loadIntegrationTools — short-circuit paths', () => {
  it('returns [] and skips the DB lookup when Composio is not configured', async () => {
    composioConfiguredMock.mockReturnValue(false);
    const out = await loadIntegrationTools(makeCtx());
    expect(out).toEqual([]);
    // Don't pay the DB round-trip when there's no point.
    expect(activeToolkitsMock).not.toHaveBeenCalled();
    expect(buildToolkitAgentToolsMock).not.toHaveBeenCalled();
  });

  it('returns [] when the realtor has zero active toolkits — no Composio call', async () => {
    activeToolkitsMock.mockResolvedValue([]);
    const out = await loadIntegrationTools(makeCtx());
    expect(out).toEqual([]);
    expect(activeToolkitsMock).toHaveBeenCalledTimes(1);
    // Critical: no point asking Composio for tools across zero toolkits.
    expect(buildToolkitAgentToolsMock).not.toHaveBeenCalled();
  });
});

describe('loadIntegrationTools — happy path', () => {
  it('builds tools per-toolkit (one call per active toolkit) and concatenates results', async () => {
    activeToolkitsMock.mockResolvedValue(['gmail', 'slack']);
    buildToolkitAgentToolsMock
      .mockResolvedValueOnce([{ name: 'gmail.send' }])
      .mockResolvedValueOnce([{ name: 'slack.post' }]);

    const out = await loadIntegrationTools(makeCtx());

    // Per-toolkit isolation — a refactor that batches all toolkits
    // into one call would silence the auth-error reconciliation below.
    expect(buildToolkitAgentToolsMock).toHaveBeenCalledTimes(2);
    expect(buildToolkitAgentToolsMock).toHaveBeenNthCalledWith(1, {
      toolkit: 'gmail',
      userId: 'user_clerk_123',
    });
    expect(buildToolkitAgentToolsMock).toHaveBeenNthCalledWith(2, {
      toolkit: 'slack',
      userId: 'user_clerk_123',
    });
    // Result is the concatenation, in toolkit order.
    expect(out).toEqual([{ name: 'gmail.send' }, { name: 'slack.post' }]);
  });

  it('uses the realtor\'s clerk userId as the entityId — Composio identity boundary', async () => {
    activeToolkitsMock.mockResolvedValue(['gmail']);
    buildToolkitAgentToolsMock.mockResolvedValue([{ name: 'gmail.send' }]);
    await loadIntegrationTools(makeCtx());
    // entityId must NOT be the DB user id or the space id — Composio
    // scopes connections per "entity", and the clerk id is what we
    // pass on initiate. Drift here scrambles ownership across users.
    expect(activeToolkitsMock).toHaveBeenCalledWith({
      spaceId: 'space_1',
      userId: 'user_clerk_123',
    });
    expect(buildToolkitAgentToolsMock).toHaveBeenCalledWith({
      toolkit: 'gmail',
      userId: 'user_clerk_123',
    });
  });
});

describe('loadIntegrationTools — failure modes (chat must keep working)', () => {
  it('returns [] AND logs a warning when activeToolkits throws — chat survives DB outage', async () => {
    activeToolkitsMock.mockRejectedValue(new Error('db unreachable'));
    const out = await loadIntegrationTools(makeCtx());
    expect(out).toEqual([]);
    // Composio must not be called when the toolkit list lookup itself failed.
    expect(buildToolkitAgentToolsMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
    const [, warnCtx] = loggerWarnMock.mock.calls[0];
    expect((warnCtx as { err: string }).err).toContain('db unreachable');
  });

  it('one toolkit failing (non-auth error) drops only that toolkit\'s tools — others still load', async () => {
    activeToolkitsMock.mockResolvedValue(['gmail', 'slack']);
    buildToolkitAgentToolsMock
      .mockRejectedValueOnce(new Error('composio 503'))
      .mockResolvedValueOnce([{ name: 'slack.post' }]);

    const out = await loadIntegrationTools(makeCtx());

    // Slack tools survived even though Gmail failed. This is the load-
    // bearing test — a refactor that bails the loop on first error
    // would deny all integration tools whenever any one is sick.
    expect(out).toEqual([{ name: 'slack.post' }]);
    expect(loggerWarnMock).toHaveBeenCalled();
    // Non-auth error → row is NOT marked expired. Transient errors
    // shouldn't churn the realtor's row state.
    expect(markExpiredByToolkitMock).not.toHaveBeenCalled();
  });

  it('auth-shaped error on a toolkit flips that row to expired and continues', async () => {
    activeToolkitsMock.mockResolvedValue(['gmail', 'slack']);
    // Composio's error class — the impl matches by name, not instanceof.
    const authErr = Object.assign(new Error('not found'), {
      name: 'ComposioConnectedAccountNotFoundError',
    });
    buildToolkitAgentToolsMock
      .mockRejectedValueOnce(authErr)
      .mockResolvedValueOnce([{ name: 'slack.post' }]);

    const out = await loadIntegrationTools(makeCtx());

    expect(out).toEqual([{ name: 'slack.post' }]);
    // Auth error → markExpiredByToolkit fires for the failing toolkit.
    // Reconcile-on-error is the whole point of per-toolkit loading.
    expect(markExpiredByToolkitMock).toHaveBeenCalledTimes(1);
    expect(markExpiredByToolkitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space_1',
        userId: 'user_clerk_123',
        toolkit: 'gmail',
        error: authErr,
      }),
    );
  });

  it('401 from Composio is treated as auth-like (statusCode match)', async () => {
    activeToolkitsMock.mockResolvedValue(['gmail']);
    const httpErr = Object.assign(new Error('unauthorized'), { statusCode: 401 });
    buildToolkitAgentToolsMock.mockRejectedValueOnce(httpErr);

    const out = await loadIntegrationTools(makeCtx());

    expect(out).toEqual([]);
    expect(markExpiredByToolkitMock).toHaveBeenCalledWith(
      expect.objectContaining({ toolkit: 'gmail' }),
    );
  });

  it('does NOT throw when markExpiredByToolkit itself fails (DB blip mid-error)', async () => {
    // The implementation uses void + .catch, so even if the rec-on-error
    // write fails, the chat stays up. This is a real failure mode: we
    // discover a dead connection AND Supabase is flaky at the same time.
    activeToolkitsMock.mockResolvedValue(['gmail']);
    const authErr = Object.assign(new Error('gone'), {
      name: 'ComposioConnectedAccountNotFoundError',
    });
    buildToolkitAgentToolsMock.mockRejectedValueOnce(authErr);
    markExpiredByToolkitMock.mockRejectedValueOnce(new Error('supabase down'));

    await expect(loadIntegrationTools(makeCtx())).resolves.toEqual([]);
  });
});
