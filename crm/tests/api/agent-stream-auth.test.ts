/**
 * Auth-gate tests for GET /api/agent/stream and GET /api/agent/active-runs.
 *
 * These two routes used raw Clerk auth() and skipped requireAuth's
 * offboarding hard-stop. An offboarded realtor with a still-valid Clerk
 * session must not keep reading live agent events.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
}));

vi.mock('@upstash/redis', () => ({
  Redis: class {
    lrange() {
      return Promise.resolve([]);
    }
    zremrangebyscore() {
      return Promise.resolve(0);
    }
    zrange() {
      return Promise.resolve([]);
    }
  },
}));

import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const mockedAuth = vi.mocked(requireAuth);
const mockedSpace = vi.mocked(getSpaceForUser);

beforeEach(() => {
  vi.clearAllMocks();
  mockedSpace.mockResolvedValue({
    id: 'space_1',
    slug: 'test',
    name: 'Test',
    emoji: null,
    ownerId: 'user_1',
    brokerageId: null,
    createdAt: new Date().toISOString(),
  } as never);
});

describe('GET /api/agent/stream — auth gate', () => {
  it('returns the requireAuth 401 for an unauthenticated caller', async () => {
    mockedAuth.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const { GET } = await import('@/app/api/agent/stream/route');
    const req = new NextRequest('http://localhost/api/agent/stream?runId=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns the requireAuth 403 for an offboarded caller', async () => {
    mockedAuth.mockResolvedValue(
      NextResponse.json(
        { error: 'Your access has been revoked by your brokerage.', code: 'offboarded' },
        { status: 403 },
      ),
    );
    const { GET } = await import('@/app/api/agent/stream/route');
    const req = new NextRequest('http://localhost/api/agent/stream?runId=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('offboarded');
    expect(mockedSpace).not.toHaveBeenCalled();
  });
});

describe('GET /api/agent/active-runs — auth gate', () => {
  it('returns the requireAuth 401 for an unauthenticated caller', async () => {
    mockedAuth.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const { GET } = await import('@/app/api/agent/active-runs/route');
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns the requireAuth 403 for an offboarded caller', async () => {
    mockedAuth.mockResolvedValue(
      NextResponse.json(
        { error: 'Your access has been revoked by your brokerage.', code: 'offboarded' },
        { status: 403 },
      ),
    );
    const { GET } = await import('@/app/api/agent/active-runs/route');
    const res = await GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('offboarded');
    expect(mockedSpace).not.toHaveBeenCalled();
  });
});
