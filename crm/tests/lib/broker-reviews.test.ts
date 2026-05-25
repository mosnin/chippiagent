/**
 * BP5e — tests for the deal-review-request API surface.
 *
 * Written directly after the BP5e agent timed out twice mid-stream.
 * Scope: happy + rejection paths on every route, focusing on the
 * permission + state-machine boundaries (which are where real bugs
 * hide) rather than exhaustive input-validation coverage (the Zod
 * / type-parsing paths are straightforward).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Supabase table-keyed chain mock ───────────────────────────────────────
interface TableMock {
  rows?: Array<Record<string, unknown>>;
  single?: Record<string, unknown> | null;
  error?: { message: string; code?: string } | null;
  insertError?: { message: string; code?: string } | null;
}
let mockByTable: Record<string, TableMock> = {};

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const override = mockByTable[table] ?? {};
    const rows = override.rows ?? [];
    const single = override.single;
    const error = override.error ?? null;
    const insertError = override.insertError ?? null;

    const termThen = Promise.resolve({ data: rows, error });
    const singleThen = Promise.resolve({ data: single ?? rows[0] ?? null, error });
    const insertThen = Promise.resolve({
      data: insertError ? null : single ?? rows[0] ?? null,
      error: insertError,
    });

    const chain: Record<string, unknown> = {};
    const pass = () => chain;
    chain.select = vi.fn(pass);
    chain.eq = vi.fn(pass);
    chain.in = vi.fn(pass);
    chain.is = vi.fn(pass);
    chain.order = vi.fn(pass);
    chain.limit = vi.fn(pass);
    chain.update = vi.fn(pass);
    chain.delete = vi.fn(pass);
    chain.insert = vi.fn(() => ({
      ...chain,
      select: vi.fn(() => ({ single: vi.fn(() => insertThen), maybeSingle: vi.fn(() => insertThen) })),
      then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) => insertThen.then(r, e),
    }));
    chain.maybeSingle = vi.fn(() => singleThen);
    chain.single = vi.fn(() => singleThen);
    chain.then = (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
      termThen.then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

// ── Auth mocks (per-test override) ─────────────────────────────────────────
interface AuthState {
  clerkId: string | null;
  dbUserId: string;
  brokerageRole: 'broker_owner' | 'broker_admin' | 'realtor_member' | null;
  brokerageId: string;
  spaceOwner: { userId: string; space: { id: string; slug: string } } | null;
}
let auth: AuthState = {
  clerkId: 'clerk_1',
  dbUserId: 'u_1',
  brokerageRole: 'broker_owner',
  brokerageId: 'b_1',
  spaceOwner: { userId: 'clerk_1', space: { id: 's_1', slug: 'jane' } },
};

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: auth.clerkId })),
}));

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(async () => {
    if (!auth.clerkId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    return { userId: auth.clerkId };
  }),
  requireSpaceOwner: vi.fn(async () => {
    if (!auth.spaceOwner) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }
    return auth.spaceOwner;
  }),
}));

vi.mock('@/lib/permissions', () => ({
  requireBroker: vi.fn(async () => {
    if (!auth.brokerageRole || auth.brokerageRole === 'realtor_member') {
      throw new Error('not a broker');
    }
    return {
      membership: { id: 'm_1', role: auth.brokerageRole, userId: auth.dbUserId },
      brokerage: { id: auth.brokerageId, name: 'Test Brokerage' },
      dbUserId: auth.dbUserId,
    };
  }),
  getBrokerMemberContext: vi.fn(async () => {
    if (!auth.brokerageRole) return null;
    return {
      membership: { id: 'm_1', role: auth.brokerageRole, userId: auth.dbUserId },
      brokerage: { id: auth.brokerageId, name: 'Test Brokerage' },
      dbUserId: auth.dbUserId,
    };
  }),
}));

vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => undefined) }));

const notifyBrokerMock = vi.fn(async () => undefined);
vi.mock('@/lib/broker-notify', () => ({ notifyBroker: notifyBrokerMock }));

// ── Helpers ────────────────────────────────────────────────────────────────
function jsonReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patchReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getReq(url: string): Request {
  return new Request(url, { method: 'GET' });
}

beforeEach(() => {
  mockByTable = {};
  auth = {
    clerkId: 'clerk_1',
    dbUserId: 'u_1',
    brokerageRole: 'broker_owner',
    brokerageId: 'b_1',
    spaceOwner: { userId: 'clerk_1', space: { id: 's_1', slug: 'jane' } },
  };
  notifyBrokerMock.mockClear();
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/deals/[id]/review-request
// ──────────────────────────────────────────────────────────────────────────
describe('POST /api/deals/[id]/review-request', () => {
  async function invoke(dealId: string, body: unknown): Promise<Response> {
    const mod = await import('@/app/api/deals/[id]/review-request/route');
    return mod.POST(jsonReq(`http://x/api/deals/${dealId}/review-request`, body) as never, {
      params: Promise.resolve({ id: dealId }),
    });
  }

  it('400 when reason is missing', async () => {
    mockByTable.Deal = {
      single: { id: 'd_1', title: 'X', spaceId: 's_1', Space: { id: 's_1', slug: 'jane', brokerageId: 'b_1' } },
    };
    const res = await invoke('d_1', {});
    expect(res.status).toBe(400);
  });

  it('400 when reason > 2000 chars', async () => {
    mockByTable.Deal = {
      single: { id: 'd_1', title: 'X', spaceId: 's_1', Space: { id: 's_1', slug: 'jane', brokerageId: 'b_1' } },
    };
    const res = await invoke('d_1', { reason: 'x'.repeat(2001) });
    expect(res.status).toBe(400);
  });

  it('404 when deal not in caller space', async () => {
    mockByTable.Deal = { single: null };
    const res = await invoke('missing', { reason: 'please review' });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not found/i);
  });

  it('409 when Space has no brokerage', async () => {
    mockByTable.Deal = {
      single: { id: 'd_1', title: 'X', spaceId: 's_1', Space: { id: 's_1', slug: 'jane', brokerageId: null } },
    };
    const res = await invoke('d_1', { reason: 'r' });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/non-brokerage/i);
  });

  it('409 when the partial unique index fires (duplicate open request)', async () => {
    mockByTable.Deal = {
      single: { id: 'd_1', title: 'X', spaceId: 's_1', Space: { id: 's_1', slug: 'jane', brokerageId: 'b_1' } },
    };
    mockByTable.User = { single: { id: 'u_1' } };
    mockByTable.DealReviewRequest = {
      insertError: { code: '23505', message: 'duplicate key value' },
    };
    const res = await invoke('d_1', { reason: 'please take a look' });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/already has an open review/i);
  });

  it('201 on happy path + fires notifyBroker with review_requested', async () => {
    mockByTable.Deal = {
      single: { id: 'd_1', title: 'X', spaceId: 's_1', Space: { id: 's_1', slug: 'jane', brokerageId: 'b_1' } },
    };
    mockByTable.User = { single: { id: 'u_1' } };
    mockByTable.DealReviewRequest = {
      single: {
        id: 'r_1',
        dealId: 'd_1',
        status: 'open',
        reason: 'please review',
        createdAt: new Date().toISOString(),
      },
    };
    const res = await invoke('d_1', { reason: 'please review' });
    expect(res.status).toBe(201);
    expect(notifyBrokerMock).toHaveBeenCalledTimes(1);
    expect((notifyBrokerMock.mock.calls as unknown[][])[0][0]).toMatchObject({ type: 'review_requested' });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// PATCH /api/broker/reviews/[id]
// ──────────────────────────────────────────────────────────────────────────
describe('PATCH /api/broker/reviews/[id]', () => {
  async function invoke(id: string, body: unknown): Promise<Response> {
    const mod = await import('@/app/api/broker/reviews/[id]/route');
    return mod.PATCH(patchReq(`http://x/api/broker/reviews/${id}`, body) as never, {
      params: Promise.resolve({ id }),
    });
  }

  it('403 when caller is a realtor_member', async () => {
    auth.brokerageRole = 'realtor_member';
    const res = await invoke('r_1', { status: 'approved' });
    expect(res.status).toBe(403);
  });

  it('404 when review does not belong to caller brokerage', async () => {
    mockByTable.DealReviewRequest = { single: null };
    const res = await invoke('r_missing', { status: 'approved' });
    expect(res.status).toBe(404);
  });

  it('409 when review already resolved', async () => {
    mockByTable.DealReviewRequest = {
      single: { id: 'r_1', brokerageId: 'b_1', status: 'approved', resolvedAt: new Date().toISOString() },
    };
    const res = await invoke('r_1', { status: 'closed' });
    expect(res.status).toBe(409);
  });

  it('400 when status value is invalid', async () => {
    mockByTable.DealReviewRequest = {
      single: { id: 'r_1', brokerageId: 'b_1', status: 'open' },
    };
    const res = await invoke('r_1', { status: 'bogus' });
    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/broker/reviews/[id]/comments
// ──────────────────────────────────────────────────────────────────────────
describe('POST /api/broker/reviews/[id]/comments', () => {
  async function invoke(id: string, body: unknown): Promise<Response> {
    const mod = await import('@/app/api/broker/reviews/[id]/comments/route');
    return mod.POST(jsonReq(`http://x/api/broker/reviews/${id}/comments`, body) as never, {
      params: Promise.resolve({ id }),
    });
  }

  it('400 when body is missing', async () => {
    mockByTable.DealReviewRequest = {
      single: { id: 'r_1', brokerageId: 'b_1', requestingUserId: 'u_2' },
    };
    mockByTable.User = { single: { id: 'u_1', name: 'Jane', clerkId: 'clerk_1' } };
    const res = await invoke('r_1', {});
    expect(res.status).toBe(400);
  });

  it('403 when caller is neither a broker member nor the requesting agent', async () => {
    auth.brokerageRole = null; // not in brokerage at all
    mockByTable.DealReviewRequest = {
      single: { id: 'r_1', brokerageId: 'b_1', requestingUserId: 'someone_else', status: 'open' },
    };
    mockByTable.User = { single: { id: 'u_1', clerkId: 'clerk_1' } };
    const res = await invoke('r_1', { body: 'hi' });
    expect(res.status).toBe(403);
  });

  it('201 when caller IS the requesting agent (non-broker)', async () => {
    auth.brokerageRole = null;
    mockByTable.DealReviewRequest = {
      single: { id: 'r_1', brokerageId: 'b_1', requestingUserId: 'u_1', status: 'open' },
    };
    mockByTable.User = { single: { id: 'u_1', name: 'Jane', clerkId: 'clerk_1' } };
    mockByTable.DealReviewComment = {
      single: {
        id: 'c_1',
        body: 'got it',
        createdAt: new Date().toISOString(),
        authorUserId: 'u_1',
      },
    };
    const res = await invoke('r_1', { body: 'got it' });
    expect(res.status).toBe(201);
  });
});
