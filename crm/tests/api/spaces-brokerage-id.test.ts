/**
 * PATCH /api/spaces — brokerageId may not be self-assigned.
 *
 * Onboarding still sends { slug, brokerageId } after /api/broker/create,
 * which is legitimate because that caller already has a membership.
 * A raw UUID from anyone else used to attach a workspace to a brokerage
 * they do not belong to.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'clerk_1' })),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => null),
    del: vi.fn(async () => null),
  },
}));

vi.mock('@/lib/audit', () => ({
  audit: vi.fn(),
}));

type Queued = { data: unknown; error: unknown };
const queues: Record<string, Queued[]> = {};
const updateCalls: Array<{ table: string; payload: unknown; eqs: Array<[string, unknown]> }> = [];

function enqueue(table: string, result: Queued) {
  if (!queues[table]) queues[table] = [];
  queues[table].push(result);
}

function shift(table: string): Queued {
  return queues[table]?.shift() ?? { data: null, error: null };
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string) {
    const eqs: Array<[string, unknown]> = [];
    let pendingPayload: unknown;
    const chain: Record<string, unknown> = {};
    const pass = () => chain;
    chain.select = vi.fn(pass);
    chain.eq = vi.fn((col: string, val: unknown) => {
      eqs.push([col, val]);
      return chain;
    });
    chain.maybeSingle = vi.fn(() => Promise.resolve(shift(table)));
    chain.single = vi.fn(() => Promise.resolve(shift(table)));
    chain.update = vi.fn((payload: unknown) => {
      pendingPayload = payload;
      updateCalls.push({ table, payload, eqs });
      const next = { ...chain };
      next.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(shift(table)).then(resolve, reject);
      return next;
    });
    chain.upsert = vi.fn(() => {
      const next = { ...chain };
      next.select = vi.fn(() => ({
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(shift(table)).then(resolve, reject),
      }));
      next.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(shift(table)).then(resolve, reject);
      return next;
    });
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(shift(table)).then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { PATCH } from '@/app/api/spaces/route';
import { getSpaceForUser } from '@/lib/space';

const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

const SPACE = {
  id: 'space_1',
  slug: 'jane',
  name: 'Jane',
  emoji: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  ownerId: 'user_db_1',
};

function patchReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/spaces', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  updateCalls.length = 0;
  for (const key of Object.keys(queues)) delete queues[key];
  mockGetSpaceForUser.mockResolvedValue({
    ...SPACE,
    brokerageId: null,
    stripeSubscriptionStatus: 'active',
  } as never);
});

describe('PATCH /api/spaces brokerageId', () => {
  it('403 when the caller is not a member of the target brokerage', async () => {
    enqueue('Space', { data: [SPACE], error: null });
    enqueue('User', { data: { id: 'user_db_1' }, error: null });
    enqueue('BrokerageMembership', { data: null, error: null });

    const res = await PATCH(patchReq({ slug: 'jane', brokerageId: 'brk_victim' }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('Forbidden');
    expect(updateCalls.some((c) => c.table === 'Space')).toBe(false);
  });

  it('links the space when the caller has a membership (onboarding path)', async () => {
    enqueue('Space', { data: [SPACE], error: null });
    enqueue('User', { data: { id: 'user_db_1' }, error: null });
    enqueue('BrokerageMembership', { data: { id: 'mem_1' }, error: null });
    enqueue('Space', { data: [{ ...SPACE, brokerageId: 'brk_own' }], error: null });
    enqueue('SpaceSetting', { data: null, error: null });

    const res = await PATCH(patchReq({ slug: 'jane', brokerageId: 'brk_own' }));

    expect(res.status).toBe(200);
    const spaceUpdate = updateCalls.find((c) => c.table === 'Space');
    expect(spaceUpdate?.payload).toEqual(
      expect.objectContaining({ brokerageId: 'brk_own' }),
    );
  });
});
