/**
 * assignLeadToRealtor — claim-first CAS. Two concurrent assigns used to
 * both clone, then last-write-wins applicationStatusNote (losing one
 * realtor's assignedContactId).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Terminal = { data: unknown; error: unknown };

const fromCalls: Array<{ table: string; ops: string[] }> = [];
let selectQueue: Terminal[] = [];
let updateQueue: Terminal[] = [];
let insertResult: Terminal = { data: { id: 'clone_1' }, error: null };

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const ops: string[] = [];
    fromCalls.push({ table, ops });
    const chain: Record<string, unknown> = {};
    const passthrough = (op: string) => (..._args: unknown[]) => {
      ops.push(op);
      return chain;
    };
    chain.select = vi.fn(passthrough('select'));
    chain.eq = vi.fn(passthrough('eq'));
    chain.is = vi.fn(passthrough('is'));
    chain.maybeSingle = vi.fn(() => {
      ops.push('maybeSingle');
      if (ops.includes('update')) {
        return Promise.resolve(updateQueue.shift() ?? { data: null, error: null });
      }
      return Promise.resolve(selectQueue.shift() ?? { data: null, error: null });
    });
    chain.update = vi.fn((..._args: unknown[]) => {
      ops.push('update');
      return chain;
    });
    chain.insert = vi.fn((..._args: unknown[]) => {
      ops.push('insert');
      return chain;
    });
    chain.then = (r: (v: Terminal) => unknown, e?: (e: unknown) => unknown) => {
      const term = ops.includes('insert')
        ? insertResult
        : ops.includes('update')
          ? (updateQueue[0] ?? { data: null, error: null })
          : { data: null, error: null };
      return Promise.resolve(term).then(r, e);
    };
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

vi.mock('@/lib/space', () => ({
  getSpaceByOwnerId: vi.fn(async (ownerId: string) => {
    if (ownerId === 'broker_owner') return { id: 'broker_space' };
    if (ownerId === 'realtor_1') return { id: 'realtor_space' };
    return null;
  }),
}));

vi.mock('@/lib/notify', () => ({
  notifyNewLead: vi.fn(async () => undefined),
}));

vi.mock('@/lib/agent/fire-trigger', () => ({
  fireAgentTrigger: vi.fn(async () => undefined),
}));

import { assignLeadToRealtor } from '@/lib/broker-assign-lead';

const baseContact = {
  id: 'c1',
  spaceId: 'broker_space',
  name: 'Alex',
  email: 'a@x.com',
  phone: '555',
  tags: ['new-lead', 'application-link'],
  notes: null,
  applicationStatus: 'received',
  applicationStatusNote: null,
  updatedAt: 't0',
  type: 'QUALIFICATION',
  properties: [],
};

beforeEach(() => {
  fromCalls.length = 0;
  selectQueue = [];
  updateQueue = [];
  insertResult = { data: { id: 'clone_1' }, error: null };
});

function params() {
  return {
    brokerage: { id: 'b1', ownerId: 'broker_owner', name: 'Acme' },
    assignedByUserId: 'broker_owner',
    contactId: 'c1',
    realtorUserId: 'realtor_1',
  };
}

describe('assignLeadToRealtor', () => {
  it('returns 409 without cloning when the lead is already assigned', async () => {
    selectQueue = [
      { data: { ...baseContact, tags: ['assigned'] }, error: null }, // initial lookup
      { data: { id: 'm1', role: 'realtor_member', userId: 'realtor_1' }, error: null }, // membership
      { data: { name: 'Riley', email: 'r@x.com' }, error: null }, // realtor user
      { data: { ...baseContact, tags: ['assigned'], updatedAt: 't0' }, error: null }, // CAS read
    ];
    const result = await assignLeadToRealtor(params());
    expect(result).toEqual({
      ok: false,
      error: 'This lead has already been assigned',
      status: 409,
    });
    expect(fromCalls.some((c) => c.ops.includes('insert'))).toBe(false);
  });

  it('retries the claim after a stale updatedAt then clones once', async () => {
    selectQueue = [
      { data: baseContact, error: null },
      { data: { id: 'm1', role: 'realtor_member', userId: 'realtor_1' }, error: null },
      { data: { name: 'Riley', email: 'r@x.com' }, error: null },
      { data: baseContact, error: null }, // CAS read 1
      { data: { ...baseContact, tags: ['application-link'], updatedAt: 't1' }, error: null }, // CAS read 2
    ];
    updateQueue = [
      { data: null, error: null }, // CAS miss
      {
        data: {
          ...baseContact,
          tags: ['application-link', 'assigned'],
          applicationStatus: 'assigned',
          updatedAt: 't2',
        },
        error: null,
      },
    ];
    const result = await assignLeadToRealtor(params());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.assignedToSpaceId).toBe('realtor_space');
      expect(result.newContactId).toBeTruthy();
    }
    expect(fromCalls.some((c) => c.table === 'Contact' && c.ops.includes('insert'))).toBe(true);
  });
});
