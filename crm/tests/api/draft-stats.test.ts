/**
 * Route-level integration test for `GET /api/agent/draft-stats`.
 *
 * The endpoint is the consumer for Phase 12's feedback signal. Until something
 * reads `feedback_action`, `edit_distance`, and `decision_ms`, those columns
 * are bytes accumulating. This file guards the contract: auth + space gate,
 * the single Supabase read, the count/median math, and the exact response
 * shape downstream callers (the agent itself, future broker dashboards) will
 * bind to.
 *
 * Mocks: requireAuth, getSpaceForUser, supabase. Everything else (median,
 * rate, NextResponse) runs as real code.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';

// ── Mocks ───────────────────────────────────────────────────────────────────
// vi.mock is hoisted; declare before the route import.

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
}));

/**
 * Per-test queued terminal — the route makes exactly one `from('AgentDraft')`
 * call and awaits it as a thenable. We capture the chain calls so tests can
 * assert the .eq('spaceId'), .not('feedback_action', 'is', null), and .gte
 * filters were applied.
 */
type Terminal = { data?: unknown; error?: unknown };
let supabaseTerminal: Terminal = { data: [] };
const supabaseCalls: Array<{ table: string; chain: Array<[string, unknown[]]> }> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const calls: Array<[string, unknown[]]> = [];
    supabaseCalls.push({ table, chain: calls });

    const chain: Record<string, unknown> = {};
    const passthrough = ['select', 'eq', 'is', 'not', 'gte', 'lt', 'order', 'limit'];
    for (const method of passthrough) {
      chain[method] = vi.fn((...args: unknown[]) => {
        calls.push([method, args]);
        return chain;
      });
    }
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) => {
      try {
        return Promise.resolve(supabaseTerminal).then(resolve, reject);
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

// Imports after mocks.
import { GET } from '@/app/api/agent/draft-stats/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const mockedAuth = vi.mocked(requireAuth);
const mockedSpace = vi.mocked(getSpaceForUser);

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

beforeEach(() => {
  vi.clearAllMocks();
  supabaseTerminal = { data: [] };
  supabaseCalls.length = 0;
  mockedAuth.mockResolvedValue({ userId: 'test-user' });
  mockedSpace.mockResolvedValue(SPACE);
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/agent/draft-stats', () => {
  it('auth fails → returns the auth NextResponse unchanged', async () => {
    const unauthorized = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    mockedAuth.mockResolvedValue(unauthorized);

    const res = await GET();

    expect(res).toBe(unauthorized);
    expect(res.status).toBe(401);
    // No DB reads when auth fails.
    expect(supabaseCalls).toHaveLength(0);
  });

  it('no space → 403 Forbidden, no DB read', async () => {
    mockedSpace.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: 'Forbidden' });
    expect(supabaseCalls).toHaveLength(0);
  });

  it('empty data: no decided drafts → all zeros, null medians', async () => {
    supabaseTerminal = { data: [] };

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      windowDays: 30,
      total: 0,
      approved: 0,
      editedAndApproved: 0,
      rejected: 0,
      held: 0,
      approvalRate: 0,
      editedRate: 0,
      medianEditDistance: null,
      medianDecisionMs: null,
      outcomeCheckedCount: 0,
      outcomeAdvancedRate: 0,
    });
  });

  it('mixed data: 5 approved + 3 edited (distances 2,4,8) + 1 rejected → exact body', async () => {
    supabaseTerminal = {
      data: [
        { feedback_action: 'approved', edit_distance: 0, decision_ms: 5000 },
        { feedback_action: 'approved', edit_distance: 0, decision_ms: 7000 },
        { feedback_action: 'approved', edit_distance: 0, decision_ms: 9000 },
        { feedback_action: 'approved', edit_distance: 0, decision_ms: 11000 },
        { feedback_action: 'approved', edit_distance: 0, decision_ms: 13000 },
        { feedback_action: 'edited_and_approved', edit_distance: 2, decision_ms: 15000 },
        { feedback_action: 'edited_and_approved', edit_distance: 4, decision_ms: 17000 },
        { feedback_action: 'edited_and_approved', edit_distance: 8, decision_ms: 19000 },
        { feedback_action: 'rejected', edit_distance: null, decision_ms: 3000 },
      ],
    };

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    // 8 of 9 went out (approved + edited). 8/9 = 0.888… → 0.89.
    // 3 of 9 were edited. 3/9 = 0.333… → 0.33.
    expect(body).toEqual({
      windowDays: 30,
      total: 9,
      approved: 5,
      editedAndApproved: 3,
      rejected: 1,
      held: 0,
      approvalRate: 0.89,
      editedRate: 0.33,
      // Edit distances: [2, 4, 8] sorted, middle = 4.
      medianEditDistance: 4,
      // Decision ms: [3000, 5000, 7000, 9000, 11000, 13000, 15000, 17000, 19000], middle = 11000.
      medianDecisionMs: 11000,
      // No rows had an outcome_signal in this fixture → both fields zero.
      outcomeCheckedCount: 0,
      outcomeAdvancedRate: 0,
    });
  });

  it('even count of edited drafts → median is the average of the two middles', async () => {
    supabaseTerminal = {
      data: [
        { feedback_action: 'edited_and_approved', edit_distance: 2, decision_ms: 1000 },
        { feedback_action: 'edited_and_approved', edit_distance: 6, decision_ms: 2000 },
        { feedback_action: 'edited_and_approved', edit_distance: 10, decision_ms: 3000 },
        { feedback_action: 'edited_and_approved', edit_distance: 14, decision_ms: 4000 },
      ],
    };

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    // Edit distances [2, 6, 10, 14] → average of 6 and 10 = 8.
    expect(body.medianEditDistance).toBe(8);
    // Decision ms [1000, 2000, 3000, 4000] → average of 2000 and 3000 = 2500.
    expect(body.medianDecisionMs).toBe(2500);
    expect(body.editedAndApproved).toBe(4);
    expect(body.total).toBe(4);
    // Everyone went out → approvalRate = 1.
    expect(body.approvalRate).toBe(1);
  });

  it('held drafts count toward the total but not the approval rate', async () => {
    supabaseTerminal = {
      data: [
        { feedback_action: 'approved', edit_distance: 0, decision_ms: 5000 },
        { feedback_action: 'held', edit_distance: null, decision_ms: 8000 },
        { feedback_action: 'held', edit_distance: null, decision_ms: 12000 },
      ],
    };

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(3);
    expect(body.approved).toBe(1);
    expect(body.held).toBe(2);
    // 1 of 3 went out → 0.33.
    expect(body.approvalRate).toBe(0.33);
    expect(body.editedRate).toBe(0);
    // No edited drafts → median edit distance is null, not 0.
    expect(body.medianEditDistance).toBeNull();
    // Decision_ms still recorded for held drafts → median across all three.
    expect(body.medianDecisionMs).toBe(8000);
  });

  it('applies the correct DB filters: spaceId, feedback_action not null, 30-day window', async () => {
    supabaseTerminal = { data: [] };

    await GET();

    expect(supabaseCalls).toHaveLength(1);
    const draftCall = supabaseCalls[0];
    expect(draftCall.table).toBe('AgentDraft');

    // .eq('spaceId', space.id)
    const eqCalls = draftCall.chain.filter(([m]) => m === 'eq');
    expect(eqCalls.some(([, args]) => args[0] === 'spaceId' && args[1] === SPACE.id)).toBe(true);

    // .not('feedback_action', 'is', null)
    const notCalls = draftCall.chain.filter(([m]) => m === 'not');
    expect(
      notCalls.some(([, args]) => args[0] === 'feedback_action' && args[1] === 'is' && args[2] === null),
    ).toBe(true);

    // .gte('createdAt', <ISO 30 days ago>)
    const gteCalls = draftCall.chain.filter(([m]) => m === 'gte');
    expect(gteCalls.length).toBe(1);
    const [, gteArgs] = gteCalls[0];
    expect(gteArgs[0]).toBe('createdAt');
    const since = new Date(gteArgs[1] as string).getTime();
    const expected = Date.now() - 30 * 24 * 60 * 60 * 1000;
    // Within a few seconds of "now - 30 days" — clock drift across the boundary
    // shouldn't fail the test.
    expect(Math.abs(since - expected)).toBeLessThan(5000);
  });

  it('selects outcome_signal alongside the feedback columns', async () => {
    // The route has to actually pull outcome_signal off AgentDraft, otherwise
    // the entire phase-13 metric is zero forever.
    supabaseTerminal = { data: [] };
    await GET();

    const draftCall = supabaseCalls[0];
    const selectCalls = draftCall.chain.filter(([m]) => m === 'select');
    expect(selectCalls).toHaveLength(1);
    const selectArg = selectCalls[0][1][0] as string;
    expect(selectArg).toContain('outcome_signal');
    expect(selectArg).toContain('feedback_action');
  });

  it('outcome attribution: 2 advanced + 3 none + 1 unchecked → rate over checked only', async () => {
    // The unchecked row contributes to feedback totals but not to the outcome
    // rate, so the cron's day-1 delay doesn't poison "this draft just sent
    // and hasn't had time to land yet."
    supabaseTerminal = {
      data: [
        { feedback_action: 'approved', edit_distance: 0, decision_ms: 5000, outcome_signal: 'deal_advanced' },
        { feedback_action: 'approved', edit_distance: 0, decision_ms: 6000, outcome_signal: 'deal_advanced' },
        { feedback_action: 'approved', edit_distance: 0, decision_ms: 7000, outcome_signal: 'none' },
        { feedback_action: 'edited_and_approved', edit_distance: 4, decision_ms: 8000, outcome_signal: 'none' },
        { feedback_action: 'approved', edit_distance: 0, decision_ms: 9000, outcome_signal: 'none' },
        // One sent draft the cron hasn't checked yet.
        { feedback_action: 'approved', edit_distance: 0, decision_ms: 10000, outcome_signal: null },
      ],
    };

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    // 5 of 6 had a checked outcome.
    expect(body.outcomeCheckedCount).toBe(5);
    // 2 of those 5 advanced → 0.4 exactly.
    expect(body.outcomeAdvancedRate).toBe(0.4);

    // Feedback totals are unchanged in shape: 6 total because all 6 had a
    // feedback_action. The unchecked row is counted in `total` but not in
    // outcomeCheckedCount.
    expect(body.total).toBe(6);
  });

  it('outcome attribution: zero checked drafts → rate is 0 (not NaN, not null)', async () => {
    // A workspace where everything is fresh shouldn't render NaN in the UI.
    supabaseTerminal = {
      data: [
        { feedback_action: 'approved', edit_distance: 0, decision_ms: 5000, outcome_signal: null },
        { feedback_action: 'rejected', edit_distance: null, decision_ms: 1500, outcome_signal: null },
      ],
    };

    const res = await GET();
    const body = await res.json();

    expect(body.outcomeCheckedCount).toBe(0);
    expect(body.outcomeAdvancedRate).toBe(0);
  });

  it('ignores rows with edit_distance 0 when computing median (only true edits)', async () => {
    // The route's median is over `edited_and_approved` rows with edit_distance > 0.
    // A row labelled edited but with distance 0 (shouldn't happen, but defend
    // against it) must not pull the median toward zero.
    supabaseTerminal = {
      data: [
        { feedback_action: 'edited_and_approved', edit_distance: 0, decision_ms: 1000 },
        { feedback_action: 'edited_and_approved', edit_distance: 5, decision_ms: 2000 },
        { feedback_action: 'edited_and_approved', edit_distance: 9, decision_ms: 3000 },
      ],
    };

    const res = await GET();
    const body = await res.json();

    // Only [5, 9] feed the median → average = 7.
    expect(body.medianEditDistance).toBe(7);
    expect(body.editedAndApproved).toBe(3);
  });
});

// ── Helper unit tests ────────────────────────────────────────────────────────
// `aggregateDraftStats` is the pure-math contract both the route and the
// broker dashboard's "Draft impact" card bind to. Test it directly so the
// brokerage-wide consumer doesn't need the full request mock.

import { aggregateDraftStats, type DraftStatsRow } from '@/lib/draft-stats';

describe('aggregateDraftStats (helper)', () => {
  it('empty input → all zeros, null medians, windowDays = 30', () => {
    const stats = aggregateDraftStats([]);
    expect(stats).toEqual({
      windowDays: 30,
      total: 0,
      approved: 0,
      editedAndApproved: 0,
      rejected: 0,
      held: 0,
      approvalRate: 0,
      editedRate: 0,
      medianEditDistance: null,
      medianDecisionMs: null,
      outcomeCheckedCount: 0,
      outcomeAdvancedRate: 0,
    });
  });

  it('mixed input rolls up identically across realtor and brokerage scopes', () => {
    // The card is brokerage-wide — it concatenates rows from every space in
    // the brokerage and feeds them in. Same shape, same numbers.
    const rows: DraftStatsRow[] = [
      { feedback_action: 'approved', edit_distance: 0, decision_ms: 5000, outcome_signal: 'deal_advanced' },
      { feedback_action: 'approved', edit_distance: 0, decision_ms: 7000, outcome_signal: 'none' },
      { feedback_action: 'edited_and_approved', edit_distance: 6, decision_ms: 9000, outcome_signal: 'deal_advanced' },
      { feedback_action: 'rejected', edit_distance: null, decision_ms: 4000, outcome_signal: null },
    ];
    const stats = aggregateDraftStats(rows);
    expect(stats.total).toBe(4);
    expect(stats.approved).toBe(2);
    expect(stats.editedAndApproved).toBe(1);
    expect(stats.rejected).toBe(1);
    // 3 of 4 went out → 0.75.
    expect(stats.approvalRate).toBe(0.75);
    expect(stats.outcomeCheckedCount).toBe(3);
    // 2 of 3 advanced → 0.67.
    expect(stats.outcomeAdvancedRate).toBe(0.67);
  });

  it('outcome-rate denominator is checked-count, never total', () => {
    // Critical for the card's secondary line: a sent draft the cron hasn't
    // labelled yet must not drag the rate toward zero.
    const rows: DraftStatsRow[] = [
      { feedback_action: 'approved', edit_distance: 0, decision_ms: 1000, outcome_signal: 'deal_advanced' },
      { feedback_action: 'approved', edit_distance: 0, decision_ms: 1000, outcome_signal: null },
      { feedback_action: 'approved', edit_distance: 0, decision_ms: 1000, outcome_signal: null },
    ];
    const stats = aggregateDraftStats(rows);
    expect(stats.total).toBe(3);
    expect(stats.outcomeCheckedCount).toBe(1);
    // 1 of 1 checked advanced → 1, not 1/3.
    expect(stats.outcomeAdvancedRate).toBe(1);
  });
});
