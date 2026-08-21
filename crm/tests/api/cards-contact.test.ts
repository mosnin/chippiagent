/**
 * Route-level test for GET /api/cards/contact/[id].
 *
 * Guards the tenant boundary: space A must not read space B's contact
 * by passing B's public slug (or by omitting slug and guessing an id).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
  getSpaceFromSlug: vi.fn(),
}));

type Terminal = { data?: unknown; error?: unknown };
const terminals: Terminal[] = [];
const supabaseCalls: Array<{ table: string; chain: Array<[string, unknown[]]> }> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const calls: Array<[string, unknown[]]> = [];
    supabaseCalls.push({ table, chain: calls });
    const terminal = () => terminals.shift() ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'limit']) {
      chain[method] = vi.fn((...args: unknown[]) => {
        calls.push([method, args]);
        return chain;
      });
    }
    chain.maybeSingle = vi.fn(() => {
      calls.push(['maybeSingle', []]);
      return Promise.resolve(terminal());
    });
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) => {
      try {
        return Promise.resolve(terminal()).then(resolve, reject);
      } catch (e) {
        return reject ? reject(e) : Promise.reject(e);
      }
    };
    return chain;
  }
  return {
    supabase: {
      from: vi.fn((table: string) => makeChain(table)),
    },
  };
});

import { GET } from '@/app/api/cards/contact/[id]/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser, getSpaceFromSlug } from '@/lib/space';

const mockedAuth = vi.mocked(requireAuth);
const mockedCallerSpace = vi.mocked(getSpaceForUser);
const mockedSlugSpace = vi.mocked(getSpaceFromSlug);

const SPACE_A = {
  id: 'space_a',
  slug: 'alice',
  name: 'Alice Realty',
  emoji: null,
  ownerId: 'user_a',
  brokerageId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
} as const;

const SPACE_B = {
  id: 'space_b',
  slug: 'bob',
  name: 'Bob Realty',
  emoji: null,
  ownerId: 'user_b',
  brokerageId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
} as const;

function makeReq(contactId: string, slug?: string): NextRequest {
  const qs = slug ? `?slug=${slug}` : '';
  return new NextRequest(`http://localhost/api/cards/contact/${contactId}${qs}`);
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/cards/contact/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseCalls.length = 0;
    terminals.length = 0;
    mockedAuth.mockResolvedValue({ userId: 'clerk_alice' });
    mockedCallerSpace.mockResolvedValue(SPACE_A as never);
    mockedSlugSpace.mockResolvedValue(null);
  });

  it('returns 401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await GET(makeReq('contact_b', 'bob'), makeParams('contact_b'));
    expect(res.status).toBe(401);
    expect(mockedCallerSpace).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller has no space', async () => {
    mockedCallerSpace.mockResolvedValue(null);
    const res = await GET(makeReq('contact_a', 'alice'), makeParams('contact_a'));
    expect(res.status).toBe(403);
  });

  it('returns 403 when slug belongs to another space (no contact lookup)', async () => {
    mockedSlugSpace.mockResolvedValue(SPACE_B as never);
    const res = await GET(makeReq('contact_b', 'bob'), makeParams('contact_b'));
    expect(res.status).toBe(403);
    expect(mockedSlugSpace).toHaveBeenCalledWith('bob');
    expect(supabaseCalls).toEqual([]);
  });

  it('returns 404 for a foreign contact id when slug is omitted', async () => {
    terminals.push({ data: null, error: null });
    const res = await GET(makeReq('contact_b'), makeParams('contact_b'));
    expect(res.status).toBe(404);
    const contactQuery = supabaseCalls.find((c) => c.table === 'Contact');
    expect(contactQuery).toBeDefined();
    expect(contactQuery!.chain).toContainEqual(['eq', ['spaceId', 'space_a']]);
    expect(contactQuery!.chain).toContainEqual(['eq', ['id', 'contact_b']]);
  });

  it('returns the card when the caller owns the space and the contact', async () => {
    mockedSlugSpace.mockResolvedValue(SPACE_A as never);
    terminals.push({
      data: {
        id: 'contact_a',
        name: 'Maya',
        email: 'maya@example.com',
        phone: '555-0100',
        tags: [],
        leadType: 'rental',
        leadScore: 80,
        scoreLabel: 'hot',
        budget: 2500,
        followUpAt: null,
        notes: null,
        updatedAt: '2026-01-02T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    });
    terminals.push({ data: [], error: null });

    const res = await GET(makeReq('contact_a', 'alice'), makeParams('contact_a'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe('contact_a');
    expect(json.data.email).toBe('maya@example.com');
    const contactQuery = supabaseCalls.find((c) => c.table === 'Contact');
    expect(contactQuery!.chain).toContainEqual(['eq', ['spaceId', 'space_a']]);
  });
});
