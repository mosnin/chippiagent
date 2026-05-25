/**
 * Route-level test for `GET /api/integrations`.
 *
 * The endpoint is what the settings panel reads on every render. The
 * shape (`{ configured, connections: [{ id, toolkit, status, label,
 * lastError, createdAt }] }`) is bound by the panel's row component; a
 * silent rename here breaks every realtor's integrations screen.
 *
 * What we guard:
 *   - Auth + space gate (401, 403)
 *   - Revoked rows are filtered out — the audit trail is not realtor-facing
 *   - Field projection — extra columns must not leak into the response
 *   - The `configured` flag reflects the env truthiness
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
}));

const { listConnectionsMock, composioConfiguredMock } = vi.hoisted(() => ({
  listConnectionsMock: vi.fn(),
  composioConfiguredMock: vi.fn(() => true),
}));

vi.mock('@/lib/integrations/connections', () => ({
  listConnections: listConnectionsMock,
  // Reconcile is best-effort and called from this route. No-op in
  // tests — the route's contract is "what's in the DB," not "what
  // Composio knows about." Reconcile behavior is covered separately.
  reconcileFromComposio: vi.fn(async () => undefined),
}));

vi.mock('@/lib/integrations/composio', () => ({
  composioConfigured: composioConfiguredMock,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from '@/app/api/integrations/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

const SPACE = {
  id: 'space_1',
  slug: 'jane',
  name: 'Jane Realty',
  emoji: null,
  ownerId: 'user_db_1',
  brokerageId: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  stripeSubscriptionStatus: 'active',
} as unknown as NonNullable<Awaited<ReturnType<typeof getSpaceForUser>>>;

beforeEach(() => {
  vi.clearAllMocks();
  composioConfiguredMock.mockReturnValue(true);
  mockRequireAuth.mockResolvedValue({ userId: 'user_1' });
  mockGetSpaceForUser.mockResolvedValue(SPACE);
  listConnectionsMock.mockResolvedValue([]);
});

describe('GET /api/integrations', () => {
  it('401 when unauthenticated', async () => {
    const unauth = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    mockRequireAuth.mockResolvedValue(unauth);

    const res = await GET();

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    // No DB read on auth failure.
    expect(listConnectionsMock).not.toHaveBeenCalled();
  });

  it('403 when the caller has no space', async () => {
    mockGetSpaceForUser.mockResolvedValue(null);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body).toEqual({ error: 'Forbidden' });
    expect(listConnectionsMock).not.toHaveBeenCalled();
  });

  it('filters revoked connections out of the response', async () => {
    listConnectionsMock.mockResolvedValue([
      {
        id: 'a',
        spaceId: 'space_1',
        userId: 'user_1',
        toolkit: 'gmail',
        composioConnectionId: 'comp_a',
        status: 'active',
        label: null,
        lastError: null,
        lastUsedAt: null,
        createdAt: '2026-04-30T12:00:00.000Z',
        updatedAt: '2026-04-30T12:00:00.000Z',
      },
      {
        id: 'b',
        spaceId: 'space_1',
        userId: 'user_1',
        toolkit: 'slack',
        composioConnectionId: 'comp_b',
        status: 'revoked',
        label: null,
        lastError: null,
        lastUsedAt: null,
        createdAt: '2026-04-30T13:00:00.000Z',
        updatedAt: '2026-04-30T13:00:00.000Z',
      },
      {
        id: 'c',
        spaceId: 'space_1',
        userId: 'user_1',
        toolkit: 'notion',
        composioConnectionId: 'comp_c',
        status: 'expired',
        label: 'jane@n.com',
        lastError: 'token expired',
        lastUsedAt: null,
        createdAt: '2026-04-30T14:00:00.000Z',
        updatedAt: '2026-04-30T14:00:00.000Z',
      },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.configured).toBe(true);
    // Revoked row should NOT appear; expired row SHOULD appear (the realtor
    // gets a Reconnect affordance for it).
    const ids = (body.connections as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toEqual(['a', 'c']);
    expect(ids).not.toContain('b');
  });

  it('projects exactly the realtor-facing fields — no DB internals leak', async () => {
    // The query helper hands us full rows including userId, spaceId,
    // composioConnectionId, updatedAt. The route must drop those before
    // they leave the server boundary — exposing composioConnectionId
    // alone is a privilege bug (it's a vendor handle, not a public id).
    listConnectionsMock.mockResolvedValue([
      {
        id: 'a',
        spaceId: 'space_1',
        userId: 'user_1',
        toolkit: 'gmail',
        composioConnectionId: 'COMPOSIO_INTERNAL_HANDLE',
        status: 'active',
        label: 'jane@gmail.com',
        lastError: null,
        lastUsedAt: '2026-04-30T15:00:00.000Z',
        createdAt: '2026-04-30T12:00:00.000Z',
        updatedAt: '2026-04-30T12:00:00.000Z',
      },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(body.connections).toHaveLength(1);
    const row = body.connections[0];
    expect(Object.keys(row).sort()).toEqual(
      ['createdAt', 'id', 'label', 'lastError', 'status', 'toolkit'].sort(),
    );
    expect(row).not.toHaveProperty('composioConnectionId');
    expect(row).not.toHaveProperty('userId');
    expect(row).not.toHaveProperty('spaceId');
    // Smell-test the actual values made it through the projection.
    expect(row.toolkit).toBe('gmail');
    expect(row.status).toBe('active');
    expect(row.label).toBe('jane@gmail.com');
  });

  it('configured: false when Composio is not configured (UI hides connect surface)', async () => {
    composioConfiguredMock.mockReturnValueOnce(false);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.configured).toBe(false);
    expect(body.connections).toEqual([]);
  });

  it('reads connections scoped to the caller\'s space, not the userId', async () => {
    // Privilege boundary: a realtor on a brokerage seat has a space.id;
    // the listConnections helper filters by spaceId. If the route
    // accidentally passed userId or "all rows", the brokerage would
    // see another agent's connections.
    await GET();
    expect(listConnectionsMock).toHaveBeenCalledTimes(1);
    expect(listConnectionsMock).toHaveBeenCalledWith(SPACE.id);
  });
});
