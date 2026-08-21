/**
 * PATCH /api/deals/[id] — tenant-isolation on writes.
 *
 * Two holes this file guards:
 *   1. propertyId. Deal.propertyId's FK is only ON Property(id). Without a
 *      space check, a caller can pin their deal to another workspace's
 *      listing. The FK accepts that write; Chippi must not.
 *   2. stageId. Already rejected when the stage is not in the caller's
 *      space — keep that contract locked so a regression cannot move a
 *      deal onto another tenant's pipeline (stage loss / wrong-space).
 *
 * Mocks: requireAuth, getSpaceForUser, supabase, plus the fire-and-forget
 * side effects (vectorize / audit / agent trigger).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Terminal = { data?: unknown; error?: unknown };

let supabaseQueue: Terminal[] = [];
const supabaseCalls: Array<{ table: string; chain: Array<[string, unknown[]]> }> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const calls: Array<[string, unknown[]]> = [];
    const terminal = supabaseQueue.shift() ?? { data: null, error: null };
    supabaseCalls.push({ table, chain: calls });

    const chain: Record<string, unknown> = {};
    const passthrough = [
      'select',
      'eq',
      'in',
      'is',
      'not',
      'gte',
      'lte',
      'lt',
      'order',
      'limit',
      'update',
      'delete',
      'insert',
    ];
    for (const method of passthrough) {
      chain[method] = vi.fn((...args: unknown[]) => {
        calls.push([method, args]);
        return chain;
      });
    }
    chain.maybeSingle = vi.fn(() => Promise.resolve(terminal));
    chain.single = vi.fn(() => Promise.resolve(terminal));
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) => {
      try {
        return Promise.resolve(terminal).then(resolve, reject);
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

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
}));

vi.mock('@/lib/vectorize', () => ({
  syncDeal: vi.fn().mockResolvedValue(undefined),
  deleteDealVector: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/audit', () => ({
  audit: vi.fn(),
}));

vi.mock('@/lib/agent/fire-trigger', () => ({
  fireAgentTrigger: vi.fn().mockResolvedValue(undefined),
}));

import { PATCH } from '@/app/api/deals/[id]/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const mockedAuth = vi.mocked(requireAuth);
const mockedSpace = vi.mocked(getSpaceForUser);

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

const DEAL = {
  id: 'deal_1',
  spaceId: 'space_1',
  title: '123 Main',
  description: null,
  value: 500000,
  address: '123 Main St',
  priority: 'MEDIUM',
  closeDate: null,
  stageId: 'stage_1',
  position: 0,
  status: 'active',
  followUpAt: null,
  propertyId: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const STAGE = {
  id: 'stage_1',
  spaceId: 'space_1',
  name: 'Qualified',
  color: '#111111',
  position: 1,
};

function invoke(id: string, body: Record<string, unknown>) {
  const req = new NextRequest(`http://localhost/api/deals/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return PATCH(req, { params: Promise.resolve({ id }) });
}

function queue(terminals: Terminal[]) {
  supabaseQueue = [...terminals];
}

function tableCalls(table: string) {
  return supabaseCalls.filter((c) => c.table === table);
}

function eqPairs(table: string): Array<[unknown, unknown]> {
  return tableCalls(table).flatMap((c) =>
    c.chain
      .filter(([method]) => method === 'eq')
      .map(([, args]) => [args[0], args[1]] as [unknown, unknown]),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseQueue = [];
  supabaseCalls.length = 0;
  mockedAuth.mockResolvedValue({ userId: 'user_1' });
  mockedSpace.mockResolvedValue(SPACE);
});

describe('PATCH /api/deals/[id] — wrong-space writes', () => {
  it('rejects a propertyId that is not in the caller space (no Deal update)', async () => {
    queue([
      { data: [DEAL], error: null },
      { data: null, error: null },
    ]);

    const res = await invoke('deal_1', { propertyId: 'prop_other_space' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid property/i);

    expect(tableCalls('Property')).toHaveLength(1);
    expect(eqPairs('Property')).toEqual(
      expect.arrayContaining([
        ['id', 'prop_other_space'],
        ['spaceId', 'space_1'],
      ]),
    );

    const dealUpdates = tableCalls('Deal').filter((c) =>
      c.chain.some(([method]) => method === 'update'),
    );
    expect(dealUpdates).toHaveLength(0);
  });

  it('unlinks when propertyId is null without a Property lookup', async () => {
    const updated = { ...DEAL, propertyId: null, updatedAt: '2026-08-21T00:00:00.000Z' };
    queue([
      { data: [DEAL], error: null },
      { data: updated, error: null },
      { data: STAGE, error: null },
    ]);

    const res = await invoke('deal_1', { propertyId: null });
    expect(res.status).toBe(200);

    expect(tableCalls('Property')).toHaveLength(0);

    const dealUpdates = tableCalls('Deal').filter((c) =>
      c.chain.some(([method]) => method === 'update'),
    );
    expect(dealUpdates).toHaveLength(1);
    const updatePayload = dealUpdates[0].chain.find(([method]) => method === 'update')?.[1][0] as {
      propertyId: unknown;
    };
    expect(updatePayload.propertyId).toBeNull();
    expect(eqPairs('Deal')).toEqual(
      expect.arrayContaining([
        ['id', 'deal_1'],
        ['spaceId', 'space_1'],
      ]),
    );
  });

  it('writes propertyId when the Property belongs to the caller space', async () => {
    const updated = { ...DEAL, propertyId: 'prop_1', updatedAt: '2026-08-21T00:00:00.000Z' };
    queue([
      { data: [DEAL], error: null },
      { data: { id: 'prop_1' }, error: null },
      { data: updated, error: null },
      { data: STAGE, error: null },
    ]);

    const res = await invoke('deal_1', { propertyId: 'prop_1' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.propertyId).toBe('prop_1');

    expect(eqPairs('Property')).toEqual(
      expect.arrayContaining([
        ['id', 'prop_1'],
        ['spaceId', 'space_1'],
      ]),
    );

    const dealUpdates = tableCalls('Deal').filter((c) =>
      c.chain.some(([method]) => method === 'update'),
    );
    expect(dealUpdates).toHaveLength(1);
    expect(dealUpdates[0].chain).toContainEqual(['eq', ['spaceId', 'space_1']]);
  });

  it('rejects a stageId that is not in the caller space (no Deal update)', async () => {
    queue([
      { data: [DEAL], error: null },
      { data: null, error: null },
    ]);

    const res = await invoke('deal_1', { stageId: 'stage_other_space' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid stage/i);

    expect(eqPairs('DealStage')).toEqual(
      expect.arrayContaining([
        ['id', 'stage_other_space'],
        ['spaceId', 'space_1'],
      ]),
    );

    const dealUpdates = tableCalls('Deal').filter((c) =>
      c.chain.some(([method]) => method === 'update'),
    );
    expect(dealUpdates).toHaveLength(0);
  });

  it('404 when the deal is not in the caller space', async () => {
    queue([{ data: [], error: null }]);

    const res = await invoke('deal_other_space', { title: 'Nope' });
    expect(res.status).toBe(404);

    expect(eqPairs('Deal')).toEqual(
      expect.arrayContaining([
        ['id', 'deal_other_space'],
        ['spaceId', 'space_1'],
      ]),
    );
    const dealUpdates = tableCalls('Deal').filter((c) =>
      c.chain.some(([method]) => method === 'update'),
    );
    expect(dealUpdates).toHaveLength(0);
  });
});
