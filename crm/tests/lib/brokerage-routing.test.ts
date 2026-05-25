/**
 * BP7d — vitest coverage for the brokerage lead-routing engine (BP7b).
 *
 * The engine under test is `routeBrokerageLead(brokerageId)` in
 * lib/brokerage-routing.ts. Three sibling agents (BP7a schema, BP7b
 * engine + integration, BP7c settings) are wiring this feature end-to-
 * end in parallel; this file owns unit coverage only.
 *
 * Mock shape mirrors tests/lib/broker-templates.test.ts:
 *   - A table-keyed chain mock on `@/lib/supabase` — every chain method
 *     (`select`, `eq`, `in`, `is`, `neq`, `order`, `limit`, `maybeSingle`,
 *     `single`, `update`, `insert`, etc.) returns the same chain, and
 *     terminal awaits resolve through a single `termThen` / `singleThen`.
 *   - Per-test overrides via `mockByTable[tableName] = { rows, single,
 *     error }`.
 *   - `@/lib/logger` stubbed with no-op spies.
 *
 * One deviation from broker-templates.test.ts: the engine calls
 * `.maybeSingle()` on the Brokerage row for config load. Our `singleThen`
 * threads `error` through as well, so the fail-closed test (#13) can
 * surface a select error without blowing the chain up.
 *
 * Dynamic `await import(...)` is used for the engine module so a pre-
 * migration checkout (where the file may not exist) surfaces as a test
 * failure rather than a module-resolution crash that takes the whole
 * file out.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Supabase table-keyed chain mock ───────────────────────────────────────
interface TableMock {
  rows?: Array<Record<string, unknown>>;
  single?: Record<string, unknown> | null;
  error?: { message: string; code?: string } | null;
  updateError?: { message: string; code?: string } | null;
}
let mockByTable: Record<string, TableMock> = {};

// Per-table call trackers. The cursor-update assertions lean on
// `updateCalls.Brokerage` in particular.
const fromCalls: Record<string, number> = {};
const updateCalls: Record<string, Array<Record<string, unknown>>> = {};
const insertCalls: Record<string, Array<Record<string, unknown>>> = {};

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    fromCalls[table] = (fromCalls[table] ?? 0) + 1;

    const override = mockByTable[table] ?? {};
    const rows = override.rows ?? [];
    const single = override.single;
    const error = override.error ?? null;
    const updateError = override.updateError ?? null;

    const termThen = Promise.resolve({ data: rows, error });
    const singleThen = Promise.resolve({
      data: error ? null : single ?? rows[0] ?? null,
      error,
    });
    const updateThen = Promise.resolve({
      data: updateError ? null : single ?? rows[0] ?? null,
      error: updateError,
    });

    const chain: Record<string, unknown> = {};
    const pass = (): Record<string, unknown> => chain;
    chain.select = vi.fn(pass);
    chain.eq = vi.fn(pass);
    chain.neq = vi.fn(pass);
    chain.in = vi.fn(pass);
    chain.is = vi.fn(pass);
    chain.not = vi.fn(pass);
    chain.gt = vi.fn(pass);
    chain.lt = vi.fn(pass);
    chain.gte = vi.fn(pass);
    chain.lte = vi.fn(pass);
    chain.order = vi.fn(pass);
    chain.limit = vi.fn(pass);
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      updateCalls[table] = updateCalls[table] ?? [];
      updateCalls[table].push(payload);
      return {
        ...chain,
        select: vi.fn(() => ({
          single: vi.fn(() => updateThen),
          maybeSingle: vi.fn(() => updateThen),
        })),
        then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
          updateThen.then(r, e),
      };
    });
    chain.insert = vi.fn((payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
      insertCalls[table] = insertCalls[table] ?? [];
      if (Array.isArray(payload)) insertCalls[table].push(...payload);
      else insertCalls[table].push(payload);
      return {
        ...chain,
        then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
          termThen.then(r, e),
      };
    });
    chain.maybeSingle = vi.fn(() => singleThen);
    chain.single = vi.fn(() => singleThen);
    chain.then = (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
      termThen.then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────

type BrokerageConfigRow = {
  autoAssignEnabled: boolean;
  assignmentMethod: 'manual' | 'round_robin' | 'score_based';
  lastAssignedUserId: string | null;
};

function makeBrokerage(overrides: Partial<BrokerageConfigRow> = {}): BrokerageConfigRow {
  return {
    autoAssignEnabled: true,
    assignmentMethod: 'round_robin',
    lastAssignedUserId: null,
    ...overrides,
  };
}

/**
 * Seed a canonical "three eligible realtors" fixture:
 *   agents u_a, u_b, u_c, each with a Space inside brokerage b_1.
 * Tests that care about a different topology override `mockByTable`
 * entries directly.
 */
function seedThreeAgents(
  config: Partial<BrokerageConfigRow> = {},
  opts: { extraUsers?: Array<Record<string, unknown>> } = {},
): void {
  mockByTable.Brokerage = { single: makeBrokerage(config) };
  mockByTable.BrokerageMembership = {
    rows: [
      { userId: 'u_a', role: 'realtor_member' },
      { userId: 'u_b', role: 'realtor_member' },
      { userId: 'u_c', role: 'realtor_member' },
    ],
  };
  mockByTable.User = {
    rows: [
      { id: 'u_a', status: 'active' },
      { id: 'u_b', status: 'active' },
      { id: 'u_c', status: 'active' },
      ...(opts.extraUsers ?? []),
    ],
  };
  mockByTable.Space = {
    rows: [
      { id: 's_a', ownerId: 'u_a', brokerageId: 'b_1' },
      { id: 's_b', ownerId: 'u_b', brokerageId: 'b_1' },
      { id: 's_c', ownerId: 'u_c', brokerageId: 'b_1' },
    ],
  };
}

async function callRouter(): Promise<unknown> {
  const mod = await import('@/lib/brokerage-routing');
  return mod.routeBrokerageLead('b_1');
}

beforeEach(() => {
  mockByTable = {};
  for (const key of Object.keys(fromCalls)) delete fromCalls[key];
  for (const key of Object.keys(updateCalls)) delete updateCalls[key];
  for (const key of Object.keys(insertCalls)) delete insertCalls[key];
});

// ──────────────────────────────────────────────────────────────────────────
// Gating
// ──────────────────────────────────────────────────────────────────────────
describe('routeBrokerageLead — gating', () => {
  it('returns null when autoAssignEnabled is false', async () => {
    mockByTable.Brokerage = {
      single: makeBrokerage({ autoAssignEnabled: false, assignmentMethod: 'round_robin' }),
    };
    const result = await callRouter();
    expect(result).toBeNull();
    // No side-effect write to Brokerage.
    expect(updateCalls.Brokerage ?? []).toHaveLength(0);
  });

  it("returns null when assignmentMethod is 'manual'", async () => {
    mockByTable.Brokerage = {
      single: makeBrokerage({ autoAssignEnabled: true, assignmentMethod: 'manual' }),
    };
    const result = await callRouter();
    expect(result).toBeNull();
    expect(updateCalls.Brokerage ?? []).toHaveLength(0);
  });

  it('returns null when no realtor_members exist', async () => {
    mockByTable.Brokerage = {
      single: makeBrokerage({ autoAssignEnabled: true, assignmentMethod: 'round_robin' }),
    };
    mockByTable.BrokerageMembership = { rows: [] };
    mockByTable.User = { rows: [] };
    mockByTable.Space = { rows: [] };
    const result = await callRouter();
    expect(result).toBeNull();
    expect(updateCalls.Brokerage ?? []).toHaveLength(0);
  });

  it('returns null when the only realtor has no Space in this brokerage', async () => {
    mockByTable.Brokerage = {
      single: makeBrokerage({ autoAssignEnabled: true, assignmentMethod: 'round_robin' }),
    };
    mockByTable.BrokerageMembership = {
      rows: [{ userId: 'u_orphan', role: 'realtor_member' }],
    };
    mockByTable.User = { rows: [{ id: 'u_orphan', status: 'active' }] };
    // Space exists, but the engine filters by `brokerageId=this` — returning an
    // empty `rows` for Space is the simplest way to simulate a cross-tenant
    // miss because the chain mock doesn't actually filter by `eq('brokerageId')`.
    mockByTable.Space = { rows: [] };
    const result = await callRouter();
    expect(result).toBeNull();
    expect(updateCalls.Brokerage ?? []).toHaveLength(0);
  });

  it('fails closed on infra errors (Brokerage select errors → null, no update)', async () => {
    mockByTable.Brokerage = {
      error: { message: 'boom', code: '08006' }, // connection failure class, NOT 42703
    };
    const result = await callRouter();
    expect(result).toBeNull();
    expect(updateCalls.Brokerage ?? []).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Round-robin
// ──────────────────────────────────────────────────────────────────────────
describe('routeBrokerageLead — round_robin', () => {
  it('picks first agent (sorted by userId) when lastAssignedUserId is NULL', async () => {
    seedThreeAgents({ assignmentMethod: 'round_robin', lastAssignedUserId: null });
    const result = (await callRouter()) as {
      agentUserId: string;
      agentSpaceId: string;
      method: string;
    } | null;
    expect(result).not.toBeNull();
    expect(result?.agentUserId).toBe('u_a');
    expect(result?.agentSpaceId).toBe('s_a');
    expect(result?.method).toBe('round_robin');
  });

  it('picks next agent after the cursor', async () => {
    seedThreeAgents({ assignmentMethod: 'round_robin', lastAssignedUserId: 'u_b' });
    const result = (await callRouter()) as { agentUserId: string } | null;
    expect(result?.agentUserId).toBe('u_c');
  });

  it('wraps to the first agent when cursor is at the end', async () => {
    seedThreeAgents({ assignmentMethod: 'round_robin', lastAssignedUserId: 'u_c' });
    const result = (await callRouter()) as { agentUserId: string } | null;
    expect(result?.agentUserId).toBe('u_a');
  });

  it('falls back to first when cursor points to a user no longer in the list', async () => {
    seedThreeAgents({ assignmentMethod: 'round_robin', lastAssignedUserId: 'u_ghost' });
    const result = (await callRouter()) as { agentUserId: string } | null;
    expect(result?.agentUserId).toBe('u_a');
  });

  it('updates lastAssignedUserId after picking (fire-and-forget)', async () => {
    seedThreeAgents({ assignmentMethod: 'round_robin', lastAssignedUserId: 'u_a' });
    const result = (await callRouter()) as { agentUserId: string } | null;
    expect(result?.agentUserId).toBe('u_b');
    // The cursor update is `void`-ed inside the engine, so give the microtask
    // queue one tick to flush before asserting.
    await Promise.resolve();
    await Promise.resolve();
    const writes = updateCalls.Brokerage ?? [];
    expect(writes.length).toBeGreaterThanOrEqual(1);
    const last = writes[writes.length - 1] ?? {};
    expect(last.lastAssignedUserId).toBe('u_b');
  });

  it('ignores offboarded agents (eligibility filter)', async () => {
    // Seed three memberships but mark u_a offboarded — u_b should win when
    // cursor is NULL because u_a is filtered out before sort.
    mockByTable.Brokerage = {
      single: makeBrokerage({ assignmentMethod: 'round_robin', lastAssignedUserId: null }),
    };
    mockByTable.BrokerageMembership = {
      rows: [
        { userId: 'u_a', role: 'realtor_member' },
        { userId: 'u_b', role: 'realtor_member' },
      ],
    };
    mockByTable.User = {
      rows: [
        { id: 'u_a', status: 'offboarded' },
        { id: 'u_b', status: 'active' },
      ],
    };
    mockByTable.Space = {
      rows: [
        { id: 's_a', ownerId: 'u_a', brokerageId: 'b_1' },
        { id: 's_b', ownerId: 'u_b', brokerageId: 'b_1' },
      ],
    };
    const result = (await callRouter()) as { agentUserId: string } | null;
    expect(result?.agentUserId).toBe('u_b');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Score-based
// ──────────────────────────────────────────────────────────────────────────
describe('routeBrokerageLead — score_based', () => {
  /**
   * Build a Contact rows array that yields `count` active leads per space.
   * Active = type IN QUALIFICATION/TOUR/APPLICATION, snoozedUntil IS NULL.
   */
  function contactRowsFor(perSpace: Record<string, number>): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    for (const [spaceId, count] of Object.entries(perSpace)) {
      for (let i = 0; i < count; i += 1) {
        out.push({ spaceId, snoozedUntil: null, type: 'QUALIFICATION' });
      }
    }
    return out;
  }

  it('picks the agent with the fewest open contacts', async () => {
    // Loads: s_a=5, s_b=2, s_c=7 → s_b wins (userId=u_b).
    seedThreeAgents({ assignmentMethod: 'score_based', lastAssignedUserId: null });
    mockByTable.Contact = {
      rows: contactRowsFor({ s_a: 5, s_b: 2, s_c: 7 }),
    };
    const result = (await callRouter()) as { agentUserId: string; method: string } | null;
    expect(result).not.toBeNull();
    expect(result?.agentUserId).toBe('u_b');
    expect(result?.method).toBe('score_based');
  });

  it('tie-breaks via round-robin cursor', async () => {
    // Two agents (u_a, u_b) tied at 1 active contact; cursor=u_a → expect u_b.
    mockByTable.Brokerage = {
      single: makeBrokerage({
        assignmentMethod: 'score_based',
        lastAssignedUserId: 'u_a',
      }),
    };
    mockByTable.BrokerageMembership = {
      rows: [
        { userId: 'u_a', role: 'realtor_member' },
        { userId: 'u_b', role: 'realtor_member' },
      ],
    };
    mockByTable.User = {
      rows: [
        { id: 'u_a', status: 'active' },
        { id: 'u_b', status: 'active' },
      ],
    };
    mockByTable.Space = {
      rows: [
        { id: 's_a', ownerId: 'u_a', brokerageId: 'b_1' },
        { id: 's_b', ownerId: 'u_b', brokerageId: 'b_1' },
      ],
    };
    mockByTable.Contact = {
      rows: contactRowsFor({ s_a: 1, s_b: 1 }),
    };
    const result = (await callRouter()) as { agentUserId: string } | null;
    expect(result?.agentUserId).toBe('u_b');
  });

  it('excludes snoozed contacts from the count', async () => {
    // Seed u_a with ONE non-snoozed contact, u_b with ZERO non-snoozed contacts
    // (but five snoozed-in-the-future ones). u_c is quiet. u_b should win.
    seedThreeAgents({ assignmentMethod: 'score_based', lastAssignedUserId: null });
    const futureIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    mockByTable.Contact = {
      rows: [
        { spaceId: 's_a', snoozedUntil: null, type: 'QUALIFICATION' },
        // u_b "load" is entirely future-snoozed — must be excluded.
        { spaceId: 's_b', snoozedUntil: futureIso, type: 'QUALIFICATION' },
        { spaceId: 's_b', snoozedUntil: futureIso, type: 'TOUR' },
        { spaceId: 's_b', snoozedUntil: futureIso, type: 'APPLICATION' },
        { spaceId: 's_b', snoozedUntil: futureIso, type: 'QUALIFICATION' },
        { spaceId: 's_b', snoozedUntil: futureIso, type: 'QUALIFICATION' },
        // u_c has one active contact, losing to u_b's effective zero.
        { spaceId: 's_c', snoozedUntil: null, type: 'TOUR' },
      ],
    };
    const result = (await callRouter()) as { agentUserId: string } | null;
    // Effective counts: s_a=1, s_b=0, s_c=1 → u_b wins.
    expect(result?.agentUserId).toBe('u_b');
  });
});
