/**
 * Assign-lead tenant guards.
 *
 * `assignLeadToRealtor` clones a brokerage pool contact into a realtor
 * workspace. Dual-brokerage is a supported path (offboard hardening keeps
 * a realtor active when they still have another membership; join-code
 * overwrites Space.brokerageId). Without the guards under test here, a
 * lead from firm B lands in a workspace now tagged as firm A — or a
 * second clone is minted next to an already-routed copy.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type SingleResult = { data: Record<string, unknown> | null; error: { message: string } | null };

const tableSingles: Record<string, SingleResult[]> = {};
const insertCalls: Record<string, Array<Record<string, unknown>>> = {};
const updateCalls: Record<string, Array<Record<string, unknown>>> = {};

function queueSingle(
  table: string,
  data: Record<string, unknown> | null,
  error: { message: string } | null = null,
): void {
  if (!tableSingles[table]) tableSingles[table] = [];
  tableSingles[table].push({ data, error });
}

const spacesByOwner: Record<string, Record<string, unknown> | null> = {};

vi.mock('@/lib/space', () => ({
  getSpaceByOwnerId: vi.fn(async (ownerId: string) => spacesByOwner[ownerId] ?? null),
}));

vi.mock('@/lib/notify', () => ({
  notifyNewLead: vi.fn(async () => undefined),
}));

vi.mock('@/lib/agent/fire-trigger', () => ({
  fireAgentTrigger: vi.fn(async () => undefined),
}));

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    const pass = (): Record<string, unknown> => chain;
    chain.select = vi.fn(pass);
    chain.eq = vi.fn(pass);
    chain.maybeSingle = vi.fn(async () => {
      const next = tableSingles[table]?.shift();
      return next ?? { data: null, error: null };
    });
    chain.insert = vi.fn((payload: Record<string, unknown>) => {
      insertCalls[table] = insertCalls[table] ?? [];
      insertCalls[table].push(payload);
      return Promise.resolve({ data: payload, error: null });
    });
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      updateCalls[table] = updateCalls[table] ?? [];
      updateCalls[table].push(payload);
      return {
        eq: vi.fn(async () => ({ data: payload, error: null })),
      };
    });
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

const BROKERAGE = { id: 'b_this', ownerId: 'u_owner', name: 'This Firm' };
const CONTACT_ID = 'c_pool';
const REALTOR_ID = 'u_realtor';

function poolContact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CONTACT_ID,
    spaceId: 's_broker',
    brokerageId: 'b_this',
    name: 'Pat Lead',
    email: 'pat@example.com',
    phone: '555-0100',
    budget: 2000,
    preferences: null,
    address: null,
    notes: null,
    type: 'QUALIFICATION',
    properties: [],
    tags: ['brokerage-lead', 'new-lead'],
    scoringStatus: 'pending',
    leadScore: null,
    scoreLabel: 'unscored',
    scoreSummary: null,
    scoreDetails: null,
    applicationData: null,
    applicationRef: null,
    applicationStatus: 'received',
    ...overrides,
  };
}

function seedHappyPath(opts?: {
  realtorBrokerageId?: string | null;
  contact?: Record<string, unknown>;
}): void {
  spacesByOwner.u_owner = {
    id: 's_broker',
    ownerId: 'u_owner',
    brokerageId: 'b_this',
  };
  spacesByOwner[REALTOR_ID] = {
    id: 's_realtor',
    ownerId: REALTOR_ID,
    brokerageId: opts?.realtorBrokerageId === undefined ? 'b_this' : opts.realtorBrokerageId,
  };
  queueSingle('Contact', opts?.contact ?? poolContact());
  queueSingle('BrokerageMembership', { id: 'm_1', role: 'realtor_member', userId: REALTOR_ID });
  queueSingle('User', { name: 'Alex Realtor', email: 'alex@example.com' });
}

async function assign() {
  const { assignLeadToRealtor } = await import('@/lib/broker-assign-lead');
  return assignLeadToRealtor({
    brokerage: BROKERAGE,
    assignedByUserId: 'u_owner',
    contactId: CONTACT_ID,
    realtorUserId: REALTOR_ID,
  });
}

beforeEach(() => {
  for (const key of Object.keys(tableSingles)) delete tableSingles[key];
  for (const key of Object.keys(insertCalls)) delete insertCalls[key];
  for (const key of Object.keys(updateCalls)) delete updateCalls[key];
  for (const key of Object.keys(spacesByOwner)) delete spacesByOwner[key];
});

describe('assignLeadToRealtor — destination space', () => {
  it('stamps brokerageId on the clone so offboard can move it', async () => {
    seedHappyPath();
    const result = await assign();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.assignedToSpaceId).toBe('s_realtor');
    const clone = insertCalls.Contact?.[0];
    expect(clone?.spaceId).toBe('s_realtor');
    expect(clone?.brokerageId).toBe('b_this');
    expect(clone?.name).toBe('Pat Lead');
  });

  it('refuses a realtor whose workspace is linked to another brokerage', async () => {
    seedHappyPath({ realtorBrokerageId: 'b_other' });
    const result = await assign();
    expect(result).toEqual({
      ok: false,
      error: 'Member workspace is linked to another brokerage',
      status: 409,
    });
    expect(insertCalls.Contact ?? []).toHaveLength(0);
    expect(updateCalls.Contact ?? []).toHaveLength(0);
  });

  it('allows a legacy realtor workspace with no brokerageId yet', async () => {
    seedHappyPath({ realtorBrokerageId: null });
    const result = await assign();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.assignedToSpaceId).toBe('s_realtor');
    expect(insertCalls.Contact?.[0]?.brokerageId).toBe('b_this');
  });
});

describe('assignLeadToRealtor — source contact', () => {
  it('refuses a contact whose brokerageId belongs to another firm', async () => {
    spacesByOwner.u_owner = { id: 's_broker', ownerId: 'u_owner', brokerageId: 'b_this' };
    queueSingle('Contact', poolContact({ brokerageId: 'b_other' }));
    const result = await assign();
    expect(result).toEqual({
      ok: false,
      error: 'Contact not found in your brokerage space',
      status: 404,
    });
    expect(insertCalls.Contact ?? []).toHaveLength(0);
  });

  it('refuses to clone a lead already sitting in another workspace', async () => {
    spacesByOwner.u_owner = { id: 's_broker', ownerId: 'u_owner', brokerageId: 'b_this' };
    // Space-first lookup misses (not in broker pool); brokerageId lookup hits
    // an auto-routed copy already in agent A's space.
    queueSingle('Contact', null);
    queueSingle(
      'Contact',
      poolContact({ spaceId: 's_agent_a', brokerageId: 'b_this' }),
    );
    const result = await assign();
    expect(result).toEqual({
      ok: false,
      error: 'This lead is already in a realtor workspace',
      status: 409,
    });
    expect(insertCalls.Contact ?? []).toHaveLength(0);
  });

  it('does not write when the realtor is not a member', async () => {
    spacesByOwner.u_owner = { id: 's_broker', ownerId: 'u_owner', brokerageId: 'b_this' };
    queueSingle('Contact', poolContact());
    queueSingle('BrokerageMembership', null);
    const result = await assign();
    expect(result).toEqual({
      ok: false,
      error: 'User is not a member of this brokerage',
      status: 403,
    });
    expect(insertCalls.Contact ?? []).toHaveLength(0);
  });
});
