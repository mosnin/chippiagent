/**
 * Inline reconcile-on-error: when the chat agent loads Composio tools and
 * a single connected account is dead (the realtor revoked our OAuth grant
 * on the provider's side, but our `IntegrationConnection` row still says
 * 'active'), we must:
 *
 *   1. Catch the auth-shaped error.
 *   2. Flip the matching row to 'expired' with `lastError` set.
 *   3. Drop that toolkit's tools but keep going — other toolkits still
 *      load, the chat doesn't crash.
 *
 * `isAuthLikeError` is the policy. We cover its three matchers
 * (typed-error name, HTTP status code, error-code prefix) plus the
 * negative case (transient errors leave the row alone).
 *
 * `loadIntegrationTools` is the orchestration. We mock the per-toolkit
 * tool builder to throw on one toolkit and resolve on another, then
 * assert that exactly the dead toolkit's row gets flipped.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { activeToolkitsMock, markExpiredMock, buildToolkitAgentToolsMock, composioConfiguredMock } =
  vi.hoisted(() => ({
    activeToolkitsMock: vi.fn(),
    markExpiredMock: vi.fn(),
    buildToolkitAgentToolsMock: vi.fn(),
    composioConfiguredMock: vi.fn(),
  }));

vi.mock('@/lib/integrations/connections', () => ({
  activeToolkits: activeToolkitsMock,
  markExpiredByToolkit: markExpiredMock,
}));

vi.mock('@/lib/integrations/composio', () => ({
  composioConfigured: composioConfiguredMock,
}));

vi.mock('@/lib/integrations/agent-tools', () => ({
  buildToolkitAgentTools: buildToolkitAgentToolsMock,
}));

import { isAuthLikeError, loadIntegrationTools } from '@/lib/ai-tools/sdk-chat';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'u_1',
    space: { id: 's_1', slug: 'jane', name: 'Jane', ownerId: 'u_1' },
    signal: new AbortController().signal,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  composioConfiguredMock.mockReturnValue(true);
  markExpiredMock.mockResolvedValue(undefined);
});

describe('isAuthLikeError', () => {
  it('matches the canonical ComposioConnectedAccountNotFoundError by name', () => {
    // We match by `name` rather than `instanceof` so the bridge stays
    // decoupled from a specific Composio SDK version.
    class ComposioConnectedAccountNotFoundError extends Error {
      override name = 'ComposioConnectedAccountNotFoundError';
    }
    const err = new ComposioConnectedAccountNotFoundError('account gone');
    expect(isAuthLikeError(err)).toBe(true);
  });

  it('matches HTTP 401 from the SDK', () => {
    const err = Object.assign(new Error('unauthorized'), { statusCode: 401 });
    expect(isAuthLikeError(err)).toBe(true);
  });

  it('matches HTTP 403 from the SDK', () => {
    const err = Object.assign(new Error('forbidden'), { statusCode: 403 });
    expect(isAuthLikeError(err)).toBe(true);
  });

  it('matches a 401/403 buried on err.cause (some SDK paths nest it)', () => {
    const err = Object.assign(new Error('wrap'), {
      cause: { statusCode: 403 },
    });
    expect(isAuthLikeError(err)).toBe(true);
  });

  it('matches Composio CONNECTED_ACCOUNT_* error codes', () => {
    const err = Object.assign(new Error('account gone'), {
      code: 'CONNECTED_ACCOUNT_NOT_FOUND',
    });
    expect(isAuthLikeError(err)).toBe(true);
  });

  it('does NOT match transient/network/5xx errors', () => {
    expect(isAuthLikeError(new Error('socket hang up'))).toBe(false);
    expect(isAuthLikeError(Object.assign(new Error('boom'), { statusCode: 500 }))).toBe(false);
    expect(isAuthLikeError(Object.assign(new Error('boom'), { statusCode: 502 }))).toBe(false);
  });

  it('does NOT match non-error values (null, undefined, strings, numbers)', () => {
    expect(isAuthLikeError(null)).toBe(false);
    expect(isAuthLikeError(undefined)).toBe(false);
    expect(isAuthLikeError('string')).toBe(false);
    expect(isAuthLikeError(401)).toBe(false);
  });
});

describe('loadIntegrationTools — reconcile-on-error', () => {
  it('returns [] without touching Composio when the SDK is not configured', async () => {
    composioConfiguredMock.mockReturnValue(false);
    const tools = await loadIntegrationTools(makeCtx());
    expect(tools).toEqual([]);
    expect(activeToolkitsMock).not.toHaveBeenCalled();
    expect(buildToolkitAgentToolsMock).not.toHaveBeenCalled();
  });

  it('returns [] when the realtor has no active toolkits', async () => {
    activeToolkitsMock.mockResolvedValue([]);
    const tools = await loadIntegrationTools(makeCtx());
    expect(tools).toEqual([]);
    expect(buildToolkitAgentToolsMock).not.toHaveBeenCalled();
  });

  it('flips the row to expired when one toolkit raises an auth-shaped error and keeps the others', async () => {
    activeToolkitsMock.mockResolvedValue(['gmail', 'slack']);
    // gmail is dead — typed error name. slack is fine.
    class ComposioConnectedAccountNotFoundError extends Error {
      override name = 'ComposioConnectedAccountNotFoundError';
    }
    const authErr = new ComposioConnectedAccountNotFoundError('gmail account gone');
    buildToolkitAgentToolsMock.mockImplementation(async ({ toolkit }: { toolkit: string }) => {
      if (toolkit === 'gmail') throw authErr;
      return [{ name: 'slack_send_message' }];
    });

    const tools = await loadIntegrationTools(makeCtx());
    // Wait a microtask for the fire-and-forget markExpired write.
    await Promise.resolve();
    await Promise.resolve();

    expect(tools).toEqual([{ name: 'slack_send_message' }]);
    expect(markExpiredMock).toHaveBeenCalledTimes(1);
    expect(markExpiredMock).toHaveBeenCalledWith({
      spaceId: 's_1',
      userId: 'u_1',
      toolkit: 'gmail',
      error: authErr,
    });
  });

  it('flips the row when the SDK throws a 401 with no typed name', async () => {
    activeToolkitsMock.mockResolvedValue(['notion']);
    const err = Object.assign(new Error('unauthorized'), { statusCode: 401 });
    buildToolkitAgentToolsMock.mockRejectedValue(err);

    const tools = await loadIntegrationTools(makeCtx());
    await Promise.resolve();
    await Promise.resolve();

    expect(tools).toEqual([]);
    expect(markExpiredMock).toHaveBeenCalledWith({
      spaceId: 's_1',
      userId: 'u_1',
      toolkit: 'notion',
      error: err,
    });
  });

  it('does NOT flip the row on a transient/5xx error (leaves it active for next turn)', async () => {
    activeToolkitsMock.mockResolvedValue(['gmail']);
    const err = Object.assign(new Error('upstream timeout'), { statusCode: 504 });
    buildToolkitAgentToolsMock.mockRejectedValue(err);

    const tools = await loadIntegrationTools(makeCtx());
    await Promise.resolve();
    await Promise.resolve();

    expect(tools).toEqual([]);
    expect(markExpiredMock).not.toHaveBeenCalled();
  });

  it('returns [] (and does not crash the chat) when activeToolkits itself fails', async () => {
    activeToolkitsMock.mockRejectedValue(new Error('db down'));
    const tools = await loadIntegrationTools(makeCtx());
    expect(tools).toEqual([]);
    expect(buildToolkitAgentToolsMock).not.toHaveBeenCalled();
    expect(markExpiredMock).not.toHaveBeenCalled();
  });

  it('survives a markExpired DB write failure without bubbling up', async () => {
    activeToolkitsMock.mockResolvedValue(['gmail']);
    const err = Object.assign(new Error('forbidden'), { statusCode: 403 });
    buildToolkitAgentToolsMock.mockRejectedValue(err);
    markExpiredMock.mockRejectedValue(new Error('supabase blip'));

    const tools = await loadIntegrationTools(makeCtx());
    await Promise.resolve();
    await Promise.resolve();

    // The chat continues regardless. The next turn will retry the flip
    // because the row is still 'active'.
    expect(tools).toEqual([]);
  });
});
