/**
 * POST /api/broker/unassign-lead — clone delete must be tenant-scoped.
 *
 * Missing or unverified assignedSpaceId used to fall through and delete
 * Contact / Deal by UUID only. Poisoned assignment metadata could wipe
 * another workspace. Broker-side unassign still proceeds so the lead
 * is not stuck as "assigned".
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/permissions', () => ({
  requireBroker: vi.fn(),
  canManageLeads: vi.fn(() => true),
}));

vi.mock('@/lib/space', () => ({
  getSpaceByOwnerId: vi.fn(),
}));

const deleteCalls: Array<{ table: string; eqs: Array<[string, unknown]> }> = [];
const updateCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];
const queues: Record<string, Array<{ data: unknown; error: unknown }>> = {};

function enqueue(table: string, result: { data: unknown; error: unknown }) {
  if (!queues[table]) queues[table] = [];
  queues[table].push(result);
}

function shift(table: string) {
  return queues[table]?.shift() ?? { data: null, error: null };
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string) {
    const eqs: Array<[string, unknown]> = [];
    const chain: Record<string, unknown> = {};
    const pass = () => chain;
    chain.select = vi.fn(pass);
    chain.eq = vi.fn((col: string, val: unknown) => {
      eqs.push([col, val]);
      return chain;
    });
    chain.limit = vi.fn(pass);
    chain.maybeSingle = vi.fn(() => Promise.resolve(shift(table)));
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      updateCalls.push({ table, payload });
      const next = { ...chain };
      next.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(shift(table)).then(resolve, reject);
      return next;
    });
    chain.delete = vi.fn(() => {
      // eq() is chained after delete(), so keep the live array.
      deleteCalls.push({ table, eqs });
      const next = { ...chain };
      next.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve, reject);
      return next;
    });
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(shift(table)).then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { POST } from '@/app/api/broker/unassign-lead/route';
import { requireBroker } from '@/lib/permissions';
import { getSpaceByOwnerId } from '@/lib/space';

const mockRequireBroker = vi.mocked(requireBroker);
const mockGetSpaceByOwnerId = vi.mocked(getSpaceByOwnerId);

const BROKER_CTX = {
  brokerage: { id: 'brk_1', ownerId: 'user_broker' },
  dbUserId: 'user_admin',
  membership: { role: 'broker_owner' },
};

const BROKER_SPACE = { id: 'space_broker', ownerId: 'user_broker' };

const ASSIGNED_CONTACT = {
  id: 'contact_broker',
  tags: ['assigned'],
  notes: '',
  applicationStatusNote: JSON.stringify({
    assignedTo: 'user_realtor',
    assignedToName: 'Pat',
    assignedContactId: 'contact_clone',
    assignedSpaceId: 'space_realtor',
    assignedAt: '2026-08-01T00:00:00.000Z',
  }),
};

function postReq(contactId = '550e8400-e29b-41d4-a716-446655440000') {
  return new NextRequest('http://localhost/api/broker/unassign-lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  deleteCalls.length = 0;
  updateCalls.length = 0;
  for (const key of Object.keys(queues)) delete queues[key];
  mockRequireBroker.mockResolvedValue(BROKER_CTX as never);
  mockGetSpaceByOwnerId.mockResolvedValue(BROKER_SPACE as never);
});

describe('POST /api/broker/unassign-lead', () => {
  it('does not delete by UUID when assigned space is missing', async () => {
    const poisoned = {
      ...ASSIGNED_CONTACT,
      applicationStatusNote: JSON.stringify({
        assignedTo: 'user_realtor',
        assignedToName: 'Pat',
        assignedContactId: 'contact_victim',
        assignedSpaceId: 'space_gone',
        assignedAt: '2026-08-01T00:00:00.000Z',
      }),
    };
    enqueue('Contact', { data: poisoned, error: null });
    enqueue('Space', { data: null, error: null });
    enqueue('User', { data: { name: 'Admin', email: 'a@x.com' }, error: null });
    enqueue('Contact', { data: poisoned, error: null });

    const res = await POST(postReq());
    expect(res.status).toBe(200);
    expect(deleteCalls).toEqual([]);
    expect(updateCalls.some((c) => c.table === 'Contact')).toBe(true);
  });

  it('does not delete when the assigned space is not a brokerage member workspace', async () => {
    enqueue('Contact', { data: ASSIGNED_CONTACT, error: null });
    enqueue('Space', { data: { ownerId: 'user_stranger' }, error: null });
    enqueue('BrokerageMembership', { data: null, error: null });
    enqueue('User', { data: { name: 'Admin' }, error: null });
    enqueue('Contact', { data: ASSIGNED_CONTACT, error: null });

    const res = await POST(postReq());
    expect(res.status).toBe(200);
    expect(deleteCalls).toEqual([]);
  });

  it('scopes clone delete to the verified member space', async () => {
    enqueue('Contact', { data: ASSIGNED_CONTACT, error: null });
    enqueue('Space', { data: { ownerId: 'user_realtor' }, error: null });
    enqueue('BrokerageMembership', { data: { id: 'mem_1' }, error: null });
    enqueue('User', { data: { name: 'Admin' }, error: null });
    enqueue('Contact', { data: { id: 'contact_clone' }, error: null });
    enqueue('DealContact', { data: [], error: null });
    enqueue('Contact', { data: null, error: null });
    enqueue('Contact', { data: ASSIGNED_CONTACT, error: null });

    const res = await POST(postReq());
    expect(res.status).toBe(200);
    const contactDelete = deleteCalls.find((c) => c.table === 'Contact');
    expect(contactDelete?.eqs).toEqual(
      expect.arrayContaining([
        ['id', 'contact_clone'],
        ['spaceId', 'space_realtor'],
      ]),
    );
  });
});
