/**
 * Route-level integration test for `GET /api/cron/draft-outcomes`.
 *
 * The cron scans recently-sent AgentDraft rows, looks up linked Deals,
 * and labels each draft 'deal_advanced' or 'none' on `outcome_signal`.
 * Tests cover:
 *   - Auth (Bearer CRON_SECRET)
 *   - Kill switch (CRON_OUTCOMES_DISABLED)
 *   - Empty result
 *   - Happy path: deal advanced after the draft sent → 'deal_advanced'
 *   - No-deal-link case → 'none'
 *   - Terminal stage (kind='closed') skipped → 'none'
 *   - Terminal status ('won','lost') skipped → 'none'
 *   - stageChangedAt before draft.updatedAt → 'none'
 *   - Batch cap respected (limit forwarded to supabase)
 *
 * Mock strategy mirrors `tests/api/agent-sweep.test.ts`: chainable thenable
 * for supabase reads, with a per-table queue of terminals. Update calls also
 * surface through the same mock and are recorded for assertion.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Supabase mock ───────────────────────────────────────────────────────────
type Terminal = { data?: unknown; error?: unknown; count?: number | null };
let supabaseQueue: Terminal[] = [];
const supabaseCalls: Array<{ table: string; chain: Array<[string, unknown[]]> }> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const calls: Array<[string, unknown[]]> = [];
    const terminal = supabaseQueue.shift() ?? { data: [], error: null };
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

// Import AFTER mocks so the route picks up mocked supabase.
import { GET } from '@/app/api/cron/draft-outcomes/route';

// ── Env helpers ─────────────────────────────────────────────────────────────
const ENV_KEYS = ['CRON_SECRET', 'CRON_OUTCOMES_DISABLED'] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function snapshotEnv() {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
}
function restoreEnv() {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function makeRequest(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.Authorization = authHeader;
  return new Request('http://localhost/api/cron/draft-outcomes', { method: 'GET', headers });
}

function invoke(authHeader?: string) {
  const req = makeRequest(authHeader);
  return GET(req as unknown as Parameters<typeof GET>[0]);
}

type DraftFixture = {
  id: string;
  spaceId: string;
  dealId: string | null;
  updatedAt: string;
};
type DealFixture = {
  id: string;
  status: string;
  stageId: string | null;
  stageChangedAt: string | null;
  updatedAt: string;
};
type StageFixture = { id: string; kind: string | null };

/**
 * Queue the supabase reads in route order:
 *   1. AgentDraft list (drafts to process)
 *   2. Deal list (only if any draft has dealId)
 *   3. DealStage list (only if any deal has stageId)
 *   Then one terminal per draft for the per-row update.
 */
function queueRun(opts: {
  drafts: DraftFixture[];
  deals?: DealFixture[];
  stages?: StageFixture[];
  /** Override per-update terminals; defaults to {error: null} for each draft. */
  updateResults?: Terminal[];
}) {
  const queue: Terminal[] = [{ data: opts.drafts, error: null }];
  const hasDealLinks = opts.drafts.some((d) => d.dealId);
  if (hasDealLinks) {
    queue.push({ data: opts.deals ?? [], error: null });
    const hasStageLinks = (opts.deals ?? []).some((d) => d.stageId);
    if (hasStageLinks) {
      queue.push({ data: opts.stages ?? [], error: null });
    }
  }
  const updates =
    opts.updateResults ?? opts.drafts.map(() => ({ error: null }) as Terminal);
  queue.push(...updates);
  supabaseQueue = queue;
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseQueue = [];
  supabaseCalls.length = 0;

  snapshotEnv();
  process.env.CRON_SECRET = 'test-secret';
  delete process.env.CRON_OUTCOMES_DISABLED;
});

afterEach(() => {
  restoreEnv();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/cron/draft-outcomes', () => {
  it('rejects when Authorization header is missing → 401', async () => {
    const res = await invoke(undefined);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(supabaseCalls).toHaveLength(0);
  });

  it('rejects when Authorization header carries the wrong secret → 401', async () => {
    const res = await invoke('Bearer wrong-secret');
    expect(res.status).toBe(401);
    expect(supabaseCalls).toHaveLength(0);
  });

  it('rejects when CRON_SECRET env var is unset → 500 (server misconfigured)', async () => {
    delete process.env.CRON_SECRET;
    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Server misconfigured' });
    expect(supabaseCalls).toHaveLength(0);
  });

  it('CRON_OUTCOMES_DISABLED=1 short-circuits → 200 {status:"disabled"}', async () => {
    process.env.CRON_OUTCOMES_DISABLED = '1';
    queueRun({
      drafts: [
        { id: 'd1', spaceId: 's', dealId: 'deal_1', updatedAt: new Date().toISOString() },
      ],
    });

    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'disabled' });
    // Not a single supabase read.
    expect(supabaseCalls).toHaveLength(0);
  });

  it('no candidate drafts → 200 with zeroed telemetry', async () => {
    queueRun({ drafts: [] });
    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(0);
    expect(body.advanced).toBe(0);
    expect(body.none).toBe(0);
    // Only one read (AgentDraft); we don't bother fetching deals when empty.
    expect(supabaseCalls.map((c) => c.table)).toEqual(['AgentDraft']);
  });

  it('happy path: deal advanced after draft sent → marks deal_advanced', async () => {
    const sentAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3d ago
    const stageMoved = new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000).toISOString();
    queueRun({
      drafts: [{ id: 'd1', spaceId: 's', dealId: 'deal_1', updatedAt: sentAt }],
      deals: [
        {
          id: 'deal_1',
          status: 'active',
          stageId: 'stage_1',
          stageChangedAt: stageMoved,
          updatedAt: stageMoved,
        },
      ],
      stages: [{ id: 'stage_1', kind: 'qualified' }],
    });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.processed).toBe(1);
    expect(body.advanced).toBe(1);
    expect(body.none).toBe(0);

    // The update call must set outcome_signal='deal_advanced'.
    const updateCall = supabaseCalls.find((c) => c.chain.some(([m]) => m === 'update'));
    expect(updateCall).toBeDefined();
    const updateArgs = updateCall!.chain.find(([m]) => m === 'update')![1] as unknown[];
    expect(updateArgs[0]).toMatchObject({ outcome_signal: 'deal_advanced' });
    expect((updateArgs[0] as { outcome_checked_at: string }).outcome_checked_at).toBeDefined();
  });

  it('draft with no dealId → marks none (no deal lookup)', async () => {
    const sentAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    queueRun({
      drafts: [{ id: 'd1', spaceId: 's', dealId: null, updatedAt: sentAt }],
      // deals/stages not queued — code path skips them when no dealId exists.
    });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.processed).toBe(1);
    expect(body.advanced).toBe(0);
    expect(body.none).toBe(1);

    // No Deal or DealStage reads when there's nothing to look up.
    expect(supabaseCalls.map((c) => c.table)).toEqual(['AgentDraft', 'AgentDraft']);
  });

  it('terminal stage kind=closed → none even if stage changed after sent', async () => {
    const sentAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const stageMoved = new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000).toISOString();
    queueRun({
      drafts: [{ id: 'd1', spaceId: 's', dealId: 'deal_1', updatedAt: sentAt }],
      deals: [
        {
          id: 'deal_1',
          status: 'active',
          stageId: 'stage_closed',
          stageChangedAt: stageMoved,
          updatedAt: stageMoved,
        },
      ],
      stages: [{ id: 'stage_closed', kind: 'closed' }],
    });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.processed).toBe(1);
    expect(body.advanced).toBe(0);
    expect(body.none).toBe(1);

    const updateCall = supabaseCalls.find((c) => c.chain.some(([m]) => m === 'update'));
    const updateArgs = updateCall!.chain.find(([m]) => m === 'update')![1] as unknown[];
    expect(updateArgs[0]).toMatchObject({ outcome_signal: 'none' });
  });

  it('terminal deal status (won) → none', async () => {
    const sentAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const stageMoved = new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000).toISOString();
    queueRun({
      drafts: [{ id: 'd1', spaceId: 's', dealId: 'deal_1', updatedAt: sentAt }],
      deals: [
        {
          id: 'deal_1',
          status: 'won',
          stageId: 'stage_1',
          stageChangedAt: stageMoved,
          updatedAt: stageMoved,
        },
      ],
      stages: [{ id: 'stage_1', kind: 'closing' }],
    });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.advanced).toBe(0);
    expect(body.none).toBe(1);
  });

  it('stageChangedAt before draft.updatedAt → none (move predates the send)', async () => {
    const sentAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const stageMovedBefore = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    queueRun({
      drafts: [{ id: 'd1', spaceId: 's', dealId: 'deal_1', updatedAt: sentAt }],
      deals: [
        {
          id: 'deal_1',
          status: 'active',
          stageId: 'stage_1',
          stageChangedAt: stageMovedBefore,
          updatedAt: stageMovedBefore,
        },
      ],
      stages: [{ id: 'stage_1', kind: 'qualified' }],
    });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.advanced).toBe(0);
    expect(body.none).toBe(1);
  });

  it('deal disappeared (no row returned) → none', async () => {
    const sentAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    queueRun({
      drafts: [{ id: 'd1', spaceId: 's', dealId: 'deal_gone', updatedAt: sentAt }],
      deals: [], // empty result for the in-list query
    });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.advanced).toBe(0);
    expect(body.none).toBe(1);
  });

  it('forwards the 200-row batch cap as a .limit() to supabase', async () => {
    queueRun({ drafts: [] });
    await invoke('Bearer test-secret');

    const draftCall = supabaseCalls.find((c) => c.table === 'AgentDraft');
    expect(draftCall).toBeDefined();
    const limitCall = draftCall!.chain.find(([m]) => m === 'limit');
    expect(limitCall).toBeDefined();
    expect(limitCall![1]).toEqual([200]);

    // Sanity-check the rest of the candidate filter. status='sent', outcome_signal IS NULL,
    // updatedAt window via gte/lte.
    const eqCalls = draftCall!.chain.filter(([m]) => m === 'eq');
    expect(eqCalls.some(([, args]) => args[0] === 'status' && args[1] === 'sent')).toBe(true);
    const isCalls = draftCall!.chain.filter(([m]) => m === 'is');
    expect(isCalls.some(([, args]) => args[0] === 'outcome_signal' && args[1] === null)).toBe(true);
    const gteCalls = draftCall!.chain.filter(([m]) => m === 'gte');
    const lteCalls = draftCall!.chain.filter(([m]) => m === 'lte');
    expect(gteCalls.length).toBe(1);
    expect(lteCalls.length).toBe(1);
    expect(gteCalls[0][1][0]).toBe('updatedAt');
    expect(lteCalls[0][1][0]).toBe('updatedAt');
  });

  it('mixed batch: one advanced + one none + one terminal → counts add up', async () => {
    const sentAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const movedAfter = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const movedBefore = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

    queueRun({
      drafts: [
        { id: 'da', spaceId: 's', dealId: 'deal_a', updatedAt: sentAt },
        { id: 'db', spaceId: 's', dealId: 'deal_b', updatedAt: sentAt },
        { id: 'dc', spaceId: 's', dealId: 'deal_c', updatedAt: sentAt },
      ],
      deals: [
        // deal_a: stage moved AFTER sent → advanced
        {
          id: 'deal_a',
          status: 'active',
          stageId: 'stage_active',
          stageChangedAt: movedAfter,
          updatedAt: movedAfter,
        },
        // deal_b: stage moved BEFORE sent → none
        {
          id: 'deal_b',
          status: 'active',
          stageId: 'stage_active',
          stageChangedAt: movedBefore,
          updatedAt: movedBefore,
        },
        // deal_c: terminal (lost) → none
        {
          id: 'deal_c',
          status: 'lost',
          stageId: 'stage_active',
          stageChangedAt: movedAfter,
          updatedAt: movedAfter,
        },
      ],
      stages: [{ id: 'stage_active', kind: 'qualified' }],
    });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.processed).toBe(3);
    expect(body.advanced).toBe(1);
    expect(body.none).toBe(2);
    expect(body.errored).toBe(0);
  });
});
