/**
 * Route-level integration test for `GET /api/agent/morning`.
 *
 * The compose function has its own 19-test unit suite. This file covers the
 * gap above it: the actual public contract — auth, space resolution, the 9
 * parallel Supabase reads, deal-health classification, and the `composedSentence`
 * passthrough. If someone deletes the `composeAgentSentence` call from the
 * route, this file goes red.
 *
 * Mocks are scoped tight: requireAuth, getSpaceForUser, supabase, and the
 * compose function. Everything else (dealHealth, constants, NextResponse) is
 * the real code path.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';

// ── Mocks ───────────────────────────────────────────────────────────────────
// These must be declared before importing the route. vi.mock is hoisted, so
// the order of `vi.mock` and `import` here is semantic only — vitest moves
// the mocks above the imports.

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
}));

vi.mock('@/lib/morning-story-agent', () => ({
  composeAgentSentence: vi.fn(),
}));

/**
 * Per-test queue of canned terminal values, one per `supabase.from(...)` call.
 * The route makes exactly 9 `from()` calls in `Promise.all`, so the queue is
 * read in that order. Each entry is what the chain resolves to when awaited
 * (count head queries → `{ count }`, list reads → `{ data: [...] }`,
 * maybeSingle → `{ data: row | null }`).
 *
 * Calls and their captured chain method args are stored on `supabaseCalls` so
 * tests can assert e.g. `.is('brokerageId', null)` was applied.
 */
type Terminal = { count?: number | null; data?: unknown; error?: unknown };
let supabaseQueue: Terminal[] = [];
const supabaseCalls: Array<{ table: string; chain: Array<[string, unknown[]]> }> = [];

vi.mock('@/lib/supabase', () => {
  /**
   * Build a chainable Supabase mock. Every chain method returns the same
   * object, accumulates its args into `chain` for assertions, and the object
   * is itself a thenable resolving to the next terminal in the queue. This
   * means `await supabase.from(...).select(...).eq(...).limit(1).maybeSingle()`
   * resolves to whatever the test queued for that `from()` call.
   */
  function makeChain(table: string): Record<string, unknown> {
    const calls: Array<[string, unknown[]]> = [];
    const terminal = supabaseQueue.shift() ?? { data: null, count: 0 };
    supabaseCalls.push({ table, chain: calls });

    const chain: Record<string, unknown> = {};
    const passthrough = ['select', 'eq', 'is', 'contains', 'gte', 'lt', 'not', 'order', 'limit'];
    for (const method of passthrough) {
      chain[method] = vi.fn((...args: unknown[]) => {
        calls.push([method, args]);
        return chain;
      });
    }
    // Terminal-style methods: maybeSingle / single return a Promise.
    chain.maybeSingle = vi.fn(() => {
      calls.push(['maybeSingle', []]);
      return Promise.resolve(terminal);
    });
    chain.single = vi.fn(() => {
      calls.push(['single', []]);
      return Promise.resolve(terminal);
    });
    // Thenable so the chain itself can be awaited (count head reads + list reads).
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

// Import AFTER mocks so the route picks up the mocked deps.
import { GET } from '@/app/api/agent/morning/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { composeAgentSentence } from '@/lib/morning-story-agent';

// ── Test helpers ────────────────────────────────────────────────────────────

const mockedAuth = vi.mocked(requireAuth);
const mockedSpace = vi.mocked(getSpaceForUser);
const mockedCompose = vi.mocked(composeAgentSentence);

const SPACE = {
  id: 'space_123',
  slug: 'test',
  name: 'Test Space',
  emoji: null,
  ownerId: 'user_owner',
  brokerageId: null,
  createdAt: new Date().toISOString(),
  stripeSubscriptionStatus: null,
} as unknown as NonNullable<Awaited<ReturnType<typeof getSpaceForUser>>>;

/**
 * Queue 9 supabase terminals in the order the route reads them:
 *   0: newPeopleRes (count)
 *   1: hotPeopleRes (count)
 *   2: overdueFollowUpsRes (count)
 *   3: activeDealsRes (data: deals[])
 *   4: draftsRes (count)
 *   5: questionsRes (count)
 *   6: topNewPersonRes (data: row | null)
 *   7: topHotPersonRes (data: row | null)
 *   8: topOverdueRes (data: row | null)
 */
function queueSupabase(terminals: Partial<Record<
  | 'newPeople' | 'hotPeople' | 'overdueFollowUps' | 'activeDeals'
  | 'drafts' | 'questions' | 'topNewPerson' | 'topHotPerson' | 'topOverdue',
  Terminal
>>): void {
  supabaseQueue = [
    terminals.newPeople ?? { count: 0 },
    terminals.hotPeople ?? { count: 0 },
    terminals.overdueFollowUps ?? { count: 0 },
    terminals.activeDeals ?? { data: [] },
    terminals.drafts ?? { count: 0 },
    terminals.questions ?? { count: 0 },
    terminals.topNewPerson ?? { data: null },
    terminals.topHotPerson ?? { data: null },
    terminals.topOverdue ?? { data: null },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseQueue = [];
  supabaseCalls.length = 0;
  mockedAuth.mockResolvedValue({ userId: 'test-user' });
  mockedSpace.mockResolvedValue(SPACE);
  mockedCompose.mockResolvedValue(null);
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/agent/morning — public contract', () => {
  it('happy path: composed sentence + summary fields populated', async () => {
    const updatedDaysAgo = (n: number) =>
      new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
    queueSupabase({
      newPeople: { count: 3 },
      hotPeople: { count: 2 },
      overdueFollowUps: { count: 4 },
      activeDeals: {
        data: [
          {
            id: 'deal_chen',
            title: 'Chen',
            status: 'active',
            updatedAt: updatedDaysAgo(35),
            closeDate: null,
            followUpAt: null,
            nextAction: null,
            nextActionDueAt: null,
          },
        ],
      },
      drafts: { count: 5 },
      questions: { count: 1 },
      topNewPerson: { data: { id: 'c_new', name: 'Avery' } },
      topHotPerson: { data: { id: 'c_hot', name: 'Jordan' } },
      topOverdue: {
        data: {
          id: 'c_late',
          name: 'Sam',
          followUpAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        },
      },
    });
    mockedCompose.mockResolvedValue("The Chen deal hasn't moved in 35 days.");

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.composedSentence).toBe("The Chen deal hasn't moved in 35 days.");
    expect(body.newPeopleCount).toBe(3);
    expect(body.hotPeopleCount).toBe(2);
    expect(body.overdueFollowUpsCount).toBe(4);
    expect(body.draftsCount).toBe(5);
    expect(body.questionsCount).toBe(1);
    expect(body.topStuckDeal).toEqual({
      id: 'deal_chen',
      title: 'Chen',
      daysStuck: expect.any(Number),
    });
    expect(body.topStuckDeal.daysStuck).toBeGreaterThanOrEqual(34);
    expect(body.topNewPerson).toEqual({ id: 'c_new', name: 'Avery' });
    expect(body.topHotPerson).toEqual({ id: 'c_hot', name: 'Jordan' });
    expect(body.topOverdueFollowUp).toEqual({
      id: 'c_late',
      name: 'Sam',
      daysOverdue: expect.any(Number),
    });
    expect(body.topOverdueFollowUp.daysOverdue).toBeGreaterThanOrEqual(3);
    expect(mockedCompose).toHaveBeenCalledWith(SPACE.id, expect.objectContaining({
      topStuckDeal: expect.objectContaining({ title: 'Chen' }),
    }));
  });

  it('agent returns null → composedSentence is null, summary still populated', async () => {
    queueSupabase({
      newPeople: { count: 1 },
      topNewPerson: { data: { id: 'c1', name: 'Riley' } },
    });
    mockedCompose.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.composedSentence).toBeNull();
    expect(body.newPeopleCount).toBe(1);
    expect(body.topNewPerson).toEqual({ id: 'c1', name: 'Riley' });
  });

  it('empty workspace → all counts 0, named subjects null, sentence null', async () => {
    queueSupabase({}); // all defaults
    mockedCompose.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      newPeopleCount: 0,
      hotPeopleCount: 0,
      overdueFollowUpsCount: 0,
      stuckDealsCount: 0,
      closingThisWeekCount: 0,
      draftsCount: 0,
      questionsCount: 0,
      topStuckDeal: null,
      topOverdueFollowUp: null,
      topNewPerson: null,
      topHotPerson: null,
      composedSentence: null,
    });
  });

  it('auth fails → returns the auth NextResponse unchanged (401)', async () => {
    const unauthorized = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    mockedAuth.mockResolvedValue(unauthorized);

    const res = await GET();

    expect(res).toBe(unauthorized);
    expect(res.status).toBe(401);
    // Supabase should not have been touched.
    expect(supabaseCalls).toHaveLength(0);
    expect(mockedCompose).not.toHaveBeenCalled();
  });

  it('space lookup fails → 403 Forbidden', async () => {
    mockedSpace.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: 'Forbidden' });
    expect(supabaseCalls).toHaveLength(0);
    expect(mockedCompose).not.toHaveBeenCalled();
  });

  it('stuck deal classification: 35-days-stale active deal → topStuckDeal + count', async () => {
    const updated = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
    queueSupabase({
      activeDeals: {
        data: [
          {
            id: 'deal_old',
            title: 'Hartley',
            status: 'active',
            updatedAt: updated,
            closeDate: null,
            followUpAt: null,
            nextAction: null,
            nextActionDueAt: null,
          },
        ],
      },
    });

    const res = await GET();
    const body = await res.json();

    expect(body.stuckDealsCount).toBe(1);
    expect(body.topStuckDeal).toEqual({
      id: 'deal_old',
      title: 'Hartley',
      daysStuck: expect.any(Number),
    });
    expect(body.topStuckDeal.daysStuck).toBeGreaterThanOrEqual(30);
  });

  it('closing-this-week: deal with closeDate 3 days out → count = 1', async () => {
    const closeDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    queueSupabase({
      activeDeals: {
        data: [
          {
            id: 'deal_soon',
            title: 'Patel',
            status: 'active',
            updatedAt: new Date().toISOString(),
            closeDate,
            followUpAt: null,
            nextAction: null,
            nextActionDueAt: null,
          },
        ],
      },
    });

    const res = await GET();
    const body = await res.json();

    expect(body.closingThisWeekCount).toBe(1);
    expect(body.stuckDealsCount).toBe(0);
  });

  it('brokerage-routed contacts excluded: each Contact query chains .is("brokerageId", null)', async () => {
    queueSupabase({});

    await GET();

    // The route makes 6 Contact queries (3 counts + 3 named-subject reads),
    // 1 Deal query, 1 AgentDraft, 1 AgentQuestion = 9 from() calls total.
    const contactCalls = supabaseCalls.filter((c) => c.table === 'Contact');
    expect(contactCalls).toHaveLength(6);
    for (const call of contactCalls) {
      const isCalls = call.chain.filter(([m]) => m === 'is');
      const hasBrokerageFilter = isCalls.some(
        ([, args]) => args[0] === 'brokerageId' && args[1] === null,
      );
      expect(hasBrokerageFilter, 'every Contact query must filter brokerageId IS NULL').toBe(true);
    }
    // Sanity: the Deal query was made and is filtered to active.
    const dealCalls = supabaseCalls.filter((c) => c.table === 'Deal');
    expect(dealCalls).toHaveLength(1);
    const dealEqs = dealCalls[0].chain.filter(([m]) => m === 'eq');
    expect(dealEqs.some(([, args]) => args[0] === 'status' && args[1] === 'active')).toBe(true);
  });
});
