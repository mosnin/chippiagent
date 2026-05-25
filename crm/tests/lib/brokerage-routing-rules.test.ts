/**
 * BP7d — vitest coverage for the DealRoutingRule layer on top of the
 * brokerage lead-routing engine.
 *
 * The engine under test is `routeBrokerageLead(brokerageId, lead?)` in
 * lib/brokerage-routing.ts. With the BP7d layer added, enabled
 * DealRoutingRule rows are evaluated BEFORE the legacy
 * assignmentMethod fallback. A rule only participates when the caller
 * passes a `lead` argument (no-arg callers keep BP7b behaviour).
 *
 * Mock shape mirrors tests/lib/brokerage-routing.test.ts — a
 * table-keyed chain mock on `@/lib/supabase` with `mockByTable[name] =
 * { rows, single, error }` overrides.
 *
 * NB on pool-tag narrowing: BrokerageMembership has no `tags` column
 * yet, so the engine's pool branch treats destinationPoolTag as
 * "ignored" for MVP. A skip-with-note test flags the coverage gap.
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

const fromCalls: Record<string, number> = {};
const updateCalls: Record<string, Array<Record<string, unknown>>> = {};

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
    chain.insert = vi.fn(() => ({
      ...chain,
      then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
        termThen.then(r, e),
    }));
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

type RuleRow = {
  id: string;
  brokerageId: string;
  name: string;
  priority: number;
  enabled: boolean;
  leadType: string | null;
  minBudget: number | null;
  maxBudget: number | null;
  matchTag: string | null;
  destinationUserId: string | null;
  destinationPoolMethod: 'round_robin' | 'score_based' | null;
  destinationPoolTag: string | null;
  createdAt: string;
};

function rule(overrides: Partial<RuleRow>): RuleRow {
  return {
    id: overrides.id ?? 'r_1',
    brokerageId: 'b_1',
    name: overrides.name ?? 'Rule',
    priority: overrides.priority ?? 100,
    enabled: overrides.enabled ?? true,
    leadType: overrides.leadType ?? null,
    minBudget: overrides.minBudget ?? null,
    maxBudget: overrides.maxBudget ?? null,
    matchTag: overrides.matchTag ?? null,
    destinationUserId: overrides.destinationUserId ?? null,
    destinationPoolMethod: overrides.destinationPoolMethod ?? null,
    destinationPoolTag: overrides.destinationPoolTag ?? null,
    createdAt: overrides.createdAt ?? '2026-04-01T00:00:00.000Z',
  };
}

/**
 * Seed a canonical "three eligible realtors" fixture: u_a, u_b, u_c each
 * with a Space inside brokerage b_1. Additional overrides can swap in
 * rules or different assignment configs.
 */
function seedThreeAgents(
  config: Partial<BrokerageConfigRow> = {},
  rules: RuleRow[] = [],
): void {
  mockByTable.Brokerage = { single: makeBrokerage(config) };
  mockByTable.DealRoutingRule = {
    rows: rules.filter((r) => r.enabled).map((r) => ({ ...r })),
  };
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

async function callRouter(lead?: {
  leadType?: string | null;
  budget?: number | null;
  tags?: string[] | null;
}): Promise<unknown> {
  const mod = await import('@/lib/brokerage-routing');
  return mod.routeBrokerageLead('b_1', lead);
}

beforeEach(() => {
  mockByTable = {};
  for (const key of Object.keys(fromCalls)) delete fromCalls[key];
  for (const key of Object.keys(updateCalls)) delete updateCalls[key];
});

// ──────────────────────────────────────────────────────────────────────────
// Criteria matching
// ──────────────────────────────────────────────────────────────────────────
describe('routeBrokerageLead + rules — criteria', () => {
  it('a rule with no criteria acts as a catch-all', async () => {
    seedThreeAgents({ assignmentMethod: 'round_robin' }, [
      rule({
        id: 'r_catch',
        name: 'Catch-all to u_c',
        priority: 10,
        destinationUserId: 'u_c',
      }),
    ]);
    const result = (await callRouter({ leadType: 'buyer', budget: 1000, tags: [] })) as {
      agentUserId: string;
      method: string;
      ruleId?: string | null;
    } | null;
    expect(result).not.toBeNull();
    expect(result?.agentUserId).toBe('u_c');
    expect(result?.method).toBe('rule');
    expect(result?.ruleId).toBe('r_catch');
  });

  it('leadType criterion: rental rule does not match a buyer lead', async () => {
    // Rental-only rule sends to u_c; a buyer lead should skip the rule
    // and fall through to round-robin (first agent = u_a).
    seedThreeAgents({ assignmentMethod: 'round_robin' }, [
      rule({
        id: 'r_rental',
        name: 'Rental → u_c',
        leadType: 'rental',
        destinationUserId: 'u_c',
      }),
    ]);
    const result = (await callRouter({ leadType: 'buyer', budget: null, tags: [] })) as {
      agentUserId: string;
      method: string;
    } | null;
    expect(result?.method).toBe('round_robin');
    expect(result?.agentUserId).toBe('u_a');
  });

  it('leadType is case-insensitive', async () => {
    seedThreeAgents({ assignmentMethod: 'round_robin' }, [
      rule({
        id: 'r_rental',
        name: 'Rental → u_b',
        leadType: 'rental',
        destinationUserId: 'u_b',
      }),
    ]);
    const result = (await callRouter({ leadType: 'RENTAL', budget: null, tags: [] })) as {
      agentUserId: string;
      method: string;
    } | null;
    expect(result?.method).toBe('rule');
    expect(result?.agentUserId).toBe('u_b');
  });

  it('budget range: lead with no budget does NOT match a rule that sets minBudget', async () => {
    seedThreeAgents({ assignmentMethod: 'round_robin' }, [
      rule({
        id: 'r_over_1k',
        name: 'Big budget → u_c',
        minBudget: 1000,
        destinationUserId: 'u_c',
      }),
    ]);
    const result = (await callRouter({ leadType: 'buyer', budget: null, tags: [] })) as {
      agentUserId: string;
      method: string;
    } | null;
    // No budget → rule skipped → round-robin fallback
    expect(result?.method).toBe('round_robin');
    expect(result?.agentUserId).toBe('u_a');
  });

  it('budget range: matches when within [min, max]', async () => {
    seedThreeAgents({ assignmentMethod: 'round_robin' }, [
      rule({
        id: 'r_in_range',
        name: '$1k–$3k → u_b',
        minBudget: 1000,
        maxBudget: 3000,
        destinationUserId: 'u_b',
      }),
    ]);
    const r = (await callRouter({ leadType: 'rental', budget: 2500, tags: [] })) as {
      agentUserId: string;
      method: string;
    } | null;
    expect(r?.method).toBe('rule');
    expect(r?.agentUserId).toBe('u_b');
  });

  it('matchTag is case-insensitive and must be present', async () => {
    seedThreeAgents({ assignmentMethod: 'round_robin' }, [
      rule({
        id: 'r_luxury',
        name: 'Luxury → u_c',
        matchTag: 'luxury',
        destinationUserId: 'u_c',
      }),
    ]);
    const match = (await callRouter({
      leadType: 'buyer',
      budget: 10,
      tags: ['new-lead', 'Luxury'],
    })) as { agentUserId: string; method: string } | null;
    expect(match?.agentUserId).toBe('u_c');

    // Reset between cases so mockByTable counters don't bleed.
    mockByTable = {};
    seedThreeAgents({ assignmentMethod: 'round_robin' }, [
      rule({
        id: 'r_luxury',
        name: 'Luxury → u_c',
        matchTag: 'luxury',
        destinationUserId: 'u_c',
      }),
    ]);
    const miss = (await callRouter({
      leadType: 'buyer',
      budget: 10,
      tags: ['new-lead'],
    })) as { agentUserId: string; method: string } | null;
    expect(miss?.method).toBe('round_robin');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Priority & enabled
// ──────────────────────────────────────────────────────────────────────────
describe('routeBrokerageLead + rules — ordering & flags', () => {
  it('priority ordering: lower number evaluates first', async () => {
    // Two rules, both match — the one with priority=10 should win over priority=100.
    seedThreeAgents({ assignmentMethod: 'round_robin' }, [
      rule({ id: 'r_low', name: 'First', priority: 10, destinationUserId: 'u_a' }),
      rule({ id: 'r_high', name: 'Second', priority: 100, destinationUserId: 'u_c' }),
    ]);
    const r = (await callRouter({ leadType: 'buyer', budget: 100, tags: [] })) as {
      ruleId?: string | null;
      agentUserId: string;
    } | null;
    expect(r?.ruleId).toBe('r_low');
    expect(r?.agentUserId).toBe('u_a');
  });

  it('disabled rule is skipped — even though it would match, the next enabled rule wins', async () => {
    // The helper only seeds `enabled=true` rules, so a disabled rule is
    // effectively removed from the mocked query. Simulate a prioritised
    // disabled rule by seeding only the enabled one — the effect is the
    // same: the engine falls to the next rule (or round-robin).
    seedThreeAgents({ assignmentMethod: 'round_robin' }, [
      // This "disabled" rule is filtered out by the seed helper's
      // `filter(enabled=true)` — simulating DB `WHERE enabled=true`.
      rule({ id: 'r_disabled', priority: 5, enabled: false, destinationUserId: 'u_c' }),
      rule({ id: 'r_enabled', priority: 50, enabled: true, destinationUserId: 'u_b' }),
    ]);
    const r = (await callRouter({ leadType: 'buyer', budget: 100, tags: [] })) as {
      ruleId?: string | null;
      agentUserId: string;
    } | null;
    expect(r?.ruleId).toBe('r_enabled');
    expect(r?.agentUserId).toBe('u_b');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Destination ineligibility → fall through
// ──────────────────────────────────────────────────────────────────────────
describe('routeBrokerageLead + rules — destination fallback', () => {
  it('specific-agent rule is skipped when the agent is offboarded', async () => {
    // Rule 1: low-priority rule routes to u_ghost (offboarded / never in list).
    // Rule 2: higher-priority (higher number = lower priority) routes to u_b.
    seedThreeAgents({ assignmentMethod: 'round_robin' }, [
      rule({
        id: 'r_ghost',
        name: 'Ghost',
        priority: 10,
        destinationUserId: 'u_ghost',
      }),
      rule({ id: 'r_real', name: 'Real', priority: 50, destinationUserId: 'u_b' }),
    ]);
    const r = (await callRouter({ leadType: 'buyer', budget: 100, tags: [] })) as {
      ruleId?: string | null;
      agentUserId: string;
    } | null;
    expect(r?.ruleId).toBe('r_real');
    expect(r?.agentUserId).toBe('u_b');
  });

  it('no rule matches → falls through to round-robin/score unchanged', async () => {
    seedThreeAgents({ assignmentMethod: 'round_robin' }, [
      rule({
        id: 'r_rental',
        priority: 10,
        leadType: 'rental',
        destinationUserId: 'u_c',
      }),
    ]);
    const r = (await callRouter({ leadType: 'buyer', budget: 100, tags: [] })) as {
      method: string;
      agentUserId: string;
    } | null;
    expect(r?.method).toBe('round_robin');
    expect(r?.agentUserId).toBe('u_a');
  });

  it('rules layer is bypassed entirely when the caller omits the lead argument', async () => {
    // A catch-all rule would match anything — but calling without a lead
    // should skip the rules layer altogether, preserving BP7b semantics.
    seedThreeAgents({ assignmentMethod: 'round_robin' }, [
      rule({ id: 'r_catch', priority: 1, destinationUserId: 'u_c' }),
    ]);
    const r = (await callRouter()) as { method: string; agentUserId: string } | null;
    expect(r?.method).toBe('round_robin');
    expect(r?.agentUserId).toBe('u_a');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Pool-method destination
// ──────────────────────────────────────────────────────────────────────────
describe('routeBrokerageLead + rules — pool method', () => {
  it('pool round-robin over the full realtor set (no tag narrowing yet)', async () => {
    // Cursor starts at u_a — a pool round-robin should advance to u_b.
    seedThreeAgents(
      { assignmentMethod: 'score_based', lastAssignedUserId: 'u_a' },
      [
        rule({
          id: 'r_pool',
          name: 'Rental pool',
          priority: 10,
          leadType: 'rental',
          destinationPoolMethod: 'round_robin',
        }),
      ],
    );
    const r = (await callRouter({ leadType: 'rental', budget: 0, tags: [] })) as {
      method: string;
      agentUserId: string;
      ruleId?: string | null;
    } | null;
    expect(r?.method).toBe('rule');
    expect(r?.ruleId).toBe('r_pool');
    expect(r?.agentUserId).toBe('u_b');
  });

  it.skip('pool method + destinationPoolTag narrows pool to tagged agents (TODO: requires BrokerageMembership.tags column)', async () => {
    // The schema accepts destinationPoolTag but the v1 engine ignores it
    // because there is no tags column on BrokerageMembership or User yet.
    // Re-enable this test after the follow-up migration ships.
    expect(true).toBe(true);
  });
});
