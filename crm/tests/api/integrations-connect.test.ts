/**
 * Connect-route tests, focused on the placeholder slugs that we surface in
 * the catalog but don't have a Composio toolkit (or custom adapter) for
 * yet. The bar:
 *
 *   - For each placeholder slug (Follow-up Boss, Compass, BoomTown, kvCORE,
 *     Real Geeks), the connect route must return 501 with a body that
 *     names the app explicitly. Generic strings rot the moment we add a
 *     fifth placeholder.
 *   - The Composio SDK must NOT be touched on this path (we never want to
 *     issue an OAuth initiate for a toolkit Composio doesn't know).
 *   - Unknown slugs still 404, not 501. The two states are distinct: 501
 *     is "we know this app, support is in progress", 404 is "we don't
 *     know what you mean."
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'user_clerk_123' })),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(async () => ({
    id: 's_1',
    slug: 'jane',
    name: 'Jane',
    ownerId: 'u_1',
  })),
}));

const { initiateMock } = vi.hoisted(() => ({ initiateMock: vi.fn() }));
vi.mock('@/lib/integrations/composio', () => ({
  initiateConnection: initiateMock,
  composioConfigured: () => true,
  loadToolsForEntity: vi.fn(async () => []),
  getConnection: vi.fn(),
  deleteConnection: vi.fn(),
}));

const { findActiveMock, revokeMock, insertConnectionMock } = vi.hoisted(() => ({
  // Loose return type so individual tests can mock the row shape they need.
  findActiveMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => null),
  revokeMock: vi.fn(async () => undefined),
  // Connect now persists at initiate-time. Default to a successful insert
  // so the happy-path tests pass; failure-path tests can override.
  insertConnectionMock: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    id: 'row_1',
    spaceId: 'space_1',
    userId: 'user_clerk_1',
    toolkit: 'gmail',
    composioConnectionId: 'pending_conn_1',
    status: 'active',
    label: null,
    lastError: null,
    lastUsedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
}));
vi.mock('@/lib/integrations/connections', () => ({
  findActive: findActiveMock,
  revoke: revokeMock,
  insertConnection: insertConnectionMock,
  activeToolkits: vi.fn(async () => []),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST } from '@/app/api/integrations/connect/[toolkit]/route';
import { COMING_SOON_TOOLKITS, findIntegration } from '@/lib/integrations/catalog';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

beforeEach(() => {
  vi.clearAllMocks();
  // Reset default return values after clearAllMocks wipes them.
  mockRequireAuth.mockResolvedValue({ userId: 'user_clerk_123' });
  mockGetSpaceForUser.mockResolvedValue({
    id: 's_1',
    slug: 'jane',
    name: 'Jane',
    emoji: '',
    ownerId: 'u_1',
    brokerageId: null,
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripeSubscriptionStatus: 'active',
    stripePeriodEnd: null,
  });
  findActiveMock.mockResolvedValue(null);
  revokeMock.mockResolvedValue(undefined);
  initiateMock.mockResolvedValue({
    redirectUrl: 'https://composio.example/oauth/start/abc',
    id: 'composio_pending_1',
  });
});

function makeRequest(toolkit: string) {
  const req = new Request(`http://localhost/api/integrations/connect/${toolkit}`, {
    method: 'POST',
  }) as unknown as Parameters<typeof POST>[0];
  return { req, params: Promise.resolve({ toolkit }) };
}

describe('POST /api/integrations/connect/[toolkit] — coming-soon slugs', () => {
  // Real-estate-niche apps without a Composio toolkit yet. Follow-up Boss
  // graduated out of this set once Composio provisioned its toolkit.
  const PLACEHOLDERS = ['compass', 'boomtown', 'kvcore', 'real_geeks'];

  it('the COMING_SOON_TOOLKITS set covers every placeholder slug we promise', () => {
    for (const slug of PLACEHOLDERS) {
      expect(COMING_SOON_TOOLKITS.has(slug)).toBe(true);
    }
  });

  it.each(PLACEHOLDERS)('returns 501 for %s and names the app in the error body', async (slug) => {
    const app = findIntegration(slug);
    expect(app).toBeDefined();

    const { req, params } = makeRequest(slug);
    const res = await POST(req, { params });
    expect(res.status).toBe(501);

    const body = (await res.json()) as { error: string };
    // The error must name the human-readable app, not the slug — this is
    // what the realtor sees in the UI when something slips through.
    expect(body.error).toContain(app!.name);
    expect(body.error.toLowerCase()).toContain('in progress');
  });

  it.each(PLACEHOLDERS)('does not call Composio initiate for %s', async (slug) => {
    const { req, params } = makeRequest(slug);
    await POST(req, { params });
    expect(initiateMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/integrations/connect/[toolkit] — unknown slug', () => {
  it('returns 404 for a slug not in the catalog (distinct from 501)', async () => {
    const { req, params } = makeRequest('totally_made_up_app');
    const res = await POST(req, { params });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/integrations/connect/[toolkit] — auth + space gates', () => {
  it('returns 401 when unauthenticated and never touches Composio', async () => {
    const unauth = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    mockRequireAuth.mockResolvedValue(unauth);
    const { req, params } = makeRequest('gmail');
    const res = await POST(req, { params });
    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(initiateMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller has no space (after auth + toolkit checks pass)', async () => {
    mockGetSpaceForUser.mockResolvedValue(null);
    const { req, params } = makeRequest('gmail');
    const res = await POST(req, { params });
    expect(res.status).toBe(403);
    expect(initiateMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/integrations/connect/[toolkit] — Composio failure', () => {
  it('returns 502 when initiateConnection throws — and the body shows the app name, not the vendor error', async () => {
    initiateMock.mockRejectedValue(new Error('composio 5xx internal'));
    const { req, params } = makeRequest('gmail');
    const res = await POST(req, { params });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(502);
    expect(body.error).toContain('Gmail');
    // Vendor error must not bleed into the realtor-facing message.
    expect(body.error).not.toContain('composio 5xx');
  });
});

describe('POST /api/integrations/connect/[toolkit] — happy path + reconnect', () => {
  it('returns { redirectUrl, connectionId, toolkit } on success', async () => {
    const { req, params } = makeRequest('gmail');
    const res = await POST(req, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      redirectUrl: 'https://composio.example/oauth/start/abc',
      connectionId: 'composio_pending_1',
      toolkit: 'gmail',
    });
    // entityId must be the realtor's Clerk userId — that's the Composio
    // identity boundary. Using the DB user id or space id would scramble
    // who-owns-what across the brokerage.
    expect(initiateMock).toHaveBeenCalledTimes(1);
    expect(initiateMock).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'user_clerk_123', toolkit: 'gmail' }),
    );
  });

  it('reconnect: revokes the existing active row BEFORE calling initiate', async () => {
    // Order matters: the DB has a unique-active index per (space, user,
    // toolkit). If initiate runs first and the realtor completes OAuth,
    // the callback's insert collides with the existing active row.
    const existing = {
      id: 'old_conn',
      spaceId: 's_1',
      userId: 'user_clerk_123',
      toolkit: 'gmail',
      composioConnectionId: 'composio_old',
      status: 'active' as const,
      label: null,
      lastError: null,
      lastUsedAt: null,
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    };
    findActiveMock.mockResolvedValue(existing);

    const order: string[] = [];
    revokeMock.mockImplementation(async () => {
      order.push('revoke');
    });
    initiateMock.mockImplementation(async () => {
      order.push('initiate');
      return { redirectUrl: 'https://composio.example/oauth/start/abc', id: 'composio_pending_1' };
    });

    const { req, params } = makeRequest('gmail');
    const res = await POST(req, { params });

    expect(res.status).toBe(200);
    expect(revokeMock).toHaveBeenCalledTimes(1);
    expect(revokeMock).toHaveBeenCalledWith(existing);
    expect(order).toEqual(['revoke', 'initiate']);
  });

  it('no existing row: skips revoke (don\'t pay vendor delete latency on first connect)', async () => {
    findActiveMock.mockResolvedValue(null);
    const { req, params } = makeRequest('gmail');
    await POST(req, { params });
    expect(revokeMock).not.toHaveBeenCalled();
    expect(initiateMock).toHaveBeenCalledTimes(1);
  });

  it('passes the configured callback URL to Composio when NEXT_PUBLIC_APP_URL is set', async () => {
    const original = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.chippi.test/';
    try {
      const { req, params } = makeRequest('gmail');
      await POST(req, { params });
      expect(initiateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackUrl: 'https://app.chippi.test/integrations/callback',
        }),
      );
    } finally {
      if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = original;
    }
  });
});
