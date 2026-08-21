/**
 * GET /api/cards/contact/[id] — ownership gate.
 *
 * The chat card used to resolve space from ?slug= with no ownership check.
 * Any signed-in user who knew a workspace slug + contact UUID could read
 * another realtor's PII. This file locks the contract: slug must pass
 * requireSpaceOwner; Contact is never queried until that succeeds.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
  requireSpaceOwner: vi.fn(),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
}));

const supabaseCalls: Array<{ table: string; eqs: Array<[string, unknown]> }> = [];
let contactTerminal: { data: Record<string, unknown> | null; error: unknown } = {
  data: null,
  error: null,
};
let activityTerminal: { data: unknown[]; error: unknown } = { data: [], error: null };

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string) {
    const eqs: Array<[string, unknown]> = [];
    supabaseCalls.push({ table, eqs });
    const chain: Record<string, unknown> = {};
    const pass = () => chain;
    chain.select = vi.fn(pass);
    chain.eq = vi.fn((col: string, val: unknown) => {
      eqs.push([col, val]);
      return chain;
    });
    chain.order = vi.fn(pass);
    chain.limit = vi.fn(pass);
    chain.maybeSingle = vi.fn(() =>
      Promise.resolve(table === 'Contact' ? contactTerminal : { data: null, error: null }),
    );
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(table === 'ContactActivity' ? activityTerminal : { data: [], error: null }).then(
        resolve,
        reject,
      );
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { GET } from '@/app/api/cards/contact/[id]/route';
import { requireAuth, requireSpaceOwner } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireSpaceOwner = vi.mocked(requireSpaceOwner);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

const OWNER_SPACE = {
  id: 'space_owner',
  slug: 'jane',
  name: 'Jane Realty',
  emoji: null,
  ownerId: 'user_db_1',
  brokerageId: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  stripeSubscriptionStatus: 'active',
};

function makeReq(id: string, slug?: string) {
  const url = slug
    ? `http://localhost/api/cards/contact/${id}?slug=${slug}`
    : `http://localhost/api/cards/contact/${id}`;
  return [
    new NextRequest(url),
    { params: Promise.resolve({ id }) },
  ] as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseCalls.length = 0;
  contactTerminal = { data: null, error: null };
  activityTerminal = { data: [], error: null };
  mockRequireAuth.mockResolvedValue({ userId: 'clerk_1' });
  mockGetSpaceForUser.mockResolvedValue(OWNER_SPACE as never);
  mockRequireSpaceOwner.mockResolvedValue({ userId: 'clerk_1', space: OWNER_SPACE as never });
});

describe('GET /api/cards/contact/[id]', () => {
  it('403 when slug belongs to another workspace — never reads Contact', async () => {
    const forbidden = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    mockRequireSpaceOwner.mockResolvedValue(forbidden);

    const [req, ctx] = makeReq('contact_victim', 'victim-slug');
    const res = await GET(req, ctx);

    expect(res.status).toBe(403);
    expect(mockRequireSpaceOwner).toHaveBeenCalledWith('victim-slug');
    expect(supabaseCalls.some((c) => c.table === 'Contact')).toBe(false);
  });

  it('401 when unauthenticated and slug is present', async () => {
    const unauth = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    mockRequireSpaceOwner.mockResolvedValue(unauth);

    const [req, ctx] = makeReq('contact_1', 'jane');
    const res = await GET(req, ctx);

    expect(res.status).toBe(401);
    expect(supabaseCalls.some((c) => c.table === 'Contact')).toBe(false);
  });

  it('scopes the contact read to the owned space after slug auth', async () => {
    contactTerminal = {
      data: {
        id: 'contact_1',
        name: 'Ada',
        email: 'ada@example.com',
        phone: '555-0100',
        tags: [],
        leadType: 'rental',
        leadScore: 80,
        scoreLabel: 'hot',
        budget: 2400,
        followUpAt: null,
        notes: null,
        updatedAt: '2026-08-01T00:00:00.000Z',
        createdAt: '2026-08-01T00:00:00.000Z',
      },
      error: null,
    };

    const [req, ctx] = makeReq('contact_1', 'jane');
    const res = await GET(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.email).toBe('ada@example.com');
    const contactCall = supabaseCalls.find((c) => c.table === 'Contact');
    expect(contactCall?.eqs).toEqual(
      expect.arrayContaining([
        ['id', 'contact_1'],
        ['spaceId', 'space_owner'],
      ]),
    );
  });

  it('without slug, uses the caller own space — not an arbitrary workspace', async () => {
    contactTerminal = {
      data: {
        id: 'contact_1',
        name: 'Ada',
        email: 'ada@example.com',
        phone: null,
        tags: [],
        leadType: null,
        leadScore: null,
        scoreLabel: null,
        budget: null,
        followUpAt: null,
        notes: null,
        updatedAt: null,
        createdAt: '2026-08-01T00:00:00.000Z',
      },
      error: null,
    };

    const [req, ctx] = makeReq('contact_1');
    const res = await GET(req, ctx);

    expect(res.status).toBe(200);
    expect(mockRequireSpaceOwner).not.toHaveBeenCalled();
    expect(mockGetSpaceForUser).toHaveBeenCalledWith('clerk_1');
    const contactCall = supabaseCalls.find((c) => c.table === 'Contact');
    expect(contactCall?.eqs).toContainEqual(['spaceId', 'space_owner']);
  });
});
