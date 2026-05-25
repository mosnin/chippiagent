/**
 * Route-level test for `DELETE /api/integrations/[id]`.
 *
 * The endpoint disconnects an integration: revokes at Composio (best
 * effort) and flips the row status. The privilege bug we're guarding
 * against is "user A disconnects user B's integration via id-guess" —
 * the route MUST verify the row belongs to the caller's space.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
}));

const { getByIdMock, revokeMock } = vi.hoisted(() => ({
  getByIdMock: vi.fn(),
  revokeMock: vi.fn(),
}));
vi.mock('@/lib/integrations/connections', () => ({
  getById: getByIdMock,
  revoke: revokeMock,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { DELETE } from '@/app/api/integrations/[id]/route';
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

function makeReq(id: string) {
  const req = new NextRequest(`http://localhost/api/integrations/${id}`, {
    method: 'DELETE',
  });
  return [req, { params: Promise.resolve({ id }) }] as const;
}

function fakeRow(over: Record<string, unknown> = {}) {
  return {
    id: 'conn_1',
    spaceId: 'space_1',
    userId: 'user_1',
    toolkit: 'gmail',
    composioConnectionId: 'composio_abc',
    status: 'active' as const,
    label: null,
    lastError: null,
    lastUsedAt: null,
    createdAt: '2026-04-30T12:00:00.000Z',
    updatedAt: '2026-04-30T12:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ userId: 'user_1' });
  mockGetSpaceForUser.mockResolvedValue(SPACE);
  getByIdMock.mockResolvedValue(fakeRow());
  revokeMock.mockResolvedValue(undefined);
});

describe('DELETE /api/integrations/[id]', () => {
  it('401 when unauthenticated and never touches Composio or DB', async () => {
    const unauth = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    mockRequireAuth.mockResolvedValue(unauth);

    const [req, ctx] = makeReq('conn_1');
    const res = await DELETE(req, ctx);

    expect(res).toBe(unauth);
    expect(res.status).toBe(401);
    expect(getByIdMock).not.toHaveBeenCalled();
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it('404 when the row does not exist', async () => {
    getByIdMock.mockResolvedValue(null);
    const [req, ctx] = makeReq('does_not_exist');
    const res = await DELETE(req, ctx);
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body).toEqual({ error: 'Not found' });
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it('403 when the row belongs to a different space (privilege boundary)', async () => {
    // The whole point of this route's space check — without it, anyone
    // who guesses a UUID can revoke another agent's Gmail integration.
    getByIdMock.mockResolvedValue(fakeRow({ spaceId: 'other_space' }));
    const [req, ctx] = makeReq('conn_1');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(403);
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it('403 when the caller has no space at all', async () => {
    mockGetSpaceForUser.mockResolvedValue(null);
    const [req, ctx] = makeReq('conn_1');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(403);
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it('happy path: revokes the row and returns { ok: true }', async () => {
    const row = fakeRow({ id: 'conn_42' });
    getByIdMock.mockResolvedValue(row);

    const [req, ctx] = makeReq('conn_42');
    const res = await DELETE(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    // Pass the WHOLE row to revoke — it needs the composioConnectionId
    // for the vendor delete call. Asserting on the full object catches
    // a refactor that "simplifies" it to just the id.
    expect(revokeMock).toHaveBeenCalledTimes(1);
    expect(revokeMock).toHaveBeenCalledWith(row);
  });
});
