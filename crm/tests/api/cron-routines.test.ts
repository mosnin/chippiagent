/**
 * Route-level integration test for `GET /api/cron/routines`.
 *
 * The hourly tick loads every enabled Routine whose nextRunAt has passed,
 * drops the ones whose space has no live subscription, fires a Modal webhook
 * per survivor (bounded to 8 in flight), and stamps lastRunAt/lastRunStatus
 * so the table trigger advances nextRunAt. None of that was tested before
 * this file existed.
 *
 * Mock strategy mirrors `tests/api/agent-sweep.test.ts`:
 *   - `@/lib/supabase`: chainable thenable; one `from()` per query and one
 *     more per routine the cron stamps. Results come off `supabaseQueue`.
 *   - `globalThis.fetch`: routed by URL — Modal calls recorded for assertion.
 *   - Env vars set in `beforeEach`, restored in `afterEach`.
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
    const passthrough = ['select', 'eq', 'in', 'lte', 'order', 'limit', 'update'];
    for (const method of passthrough) {
      chain[method] = vi.fn((...args: unknown[]) => {
        calls.push([method, args]);
        return chain;
      });
    }
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
import { GET } from '@/app/api/cron/routines/route';

// ── Env helpers ─────────────────────────────────────────────────────────────
const ENV_KEYS = [
  'CRON_SECRET',
  'CRON_ROUTINES_DISABLED',
  'MODAL_WEBHOOK_URL',
  'AGENT_INTERNAL_SECRET',
] as const;
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

// ── Fetch mock ──────────────────────────────────────────────────────────────
type ModalCall = { url: string; body: unknown };
let modalCalls: ModalCall[] = [];
let modalResponder: (spaceId: string) => Promise<Response> | Response = () =>
  new Response(JSON.stringify({ ok: true }), { status: 200 });

function buildFetchMock() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;

    if (process.env.MODAL_WEBHOOK_URL && url === process.env.MODAL_WEBHOOK_URL) {
      let body: unknown = null;
      if (typeof init?.body === 'string') {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      const spaceId = (body as { space_id?: string } | null)?.space_id ?? '';
      modalCalls.push({ url, body });
      return Promise.resolve(modalResponder(spaceId));
    }

    return new Response('unmocked', { status: 599 });
  });
}

let fetchSpy: ReturnType<typeof buildFetchMock>;

// ── Helpers ─────────────────────────────────────────────────────────────────
function invoke(authHeader?: string) {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.Authorization = authHeader;
  const req = new Request('http://localhost/api/cron/routines', { method: 'GET', headers });
  return GET(req as unknown as Parameters<typeof GET>[0]);
}

interface DueRoutine {
  id: string;
  spaceId: string;
  instruction: string;
}

/** Queue: due routines, active spaces, then one stamp result per runnable. */
function queueTick(opts: {
  due: DueRoutine[];
  activeSpaceIds: string[];
  runnableCount?: number;
}) {
  const stamps = opts.runnableCount ?? opts.due.length;
  supabaseQueue = [
    { data: opts.due, error: null },
    { data: opts.activeSpaceIds.map((id) => ({ id })), error: null },
    ...Array.from({ length: stamps }, () => ({ data: null, error: null }) as Terminal),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseQueue = [];
  supabaseCalls.length = 0;
  modalCalls = [];
  modalResponder = () => new Response(JSON.stringify({ ok: true }), { status: 200 });

  snapshotEnv();
  process.env.CRON_SECRET = 'test-secret';
  delete process.env.CRON_ROUTINES_DISABLED;
  process.env.MODAL_WEBHOOK_URL = 'https://modal.example/webhook';
  process.env.AGENT_INTERNAL_SECRET = 'agent-secret';

  fetchSpy = buildFetchMock();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  restoreEnv();
  vi.unstubAllGlobals();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/cron/routines', () => {
  it('rejects a missing Authorization header → 401, no DB or Modal calls', async () => {
    const res = await invoke(undefined);
    expect(res.status).toBe(401);
    expect(modalCalls).toHaveLength(0);
    expect(supabaseCalls).toHaveLength(0);
  });

  it('rejects the wrong secret → 401', async () => {
    const res = await invoke('Bearer nope');
    expect(res.status).toBe(401);
    expect(modalCalls).toHaveLength(0);
  });

  it('missing CRON_SECRET env → 500 server misconfigured', async () => {
    delete process.env.CRON_SECRET;
    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Server misconfigured' });
  });

  it('CRON_ROUTINES_DISABLED short-circuits → 200 disabled, no DB read', async () => {
    process.env.CRON_ROUTINES_DISABLED = '1';
    queueTick({ due: [{ id: 'r1', spaceId: 's1', instruction: 'do the thing' }], activeSpaceIds: ['s1'] });
    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'disabled' });
    expect(supabaseCalls).toHaveLength(0);
    expect(modalCalls).toHaveLength(0);
  });

  it('no due routines → 200 zeroed, no Modal calls', async () => {
    queueTick({ due: [], activeSpaceIds: [] });
    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.due).toBe(0);
    expect(body.fired).toBe(0);
    expect(modalCalls).toHaveLength(0);
    // Only the Routine due-query ran; the Space query is skipped on empty.
    expect(supabaseCalls.map((c) => c.table)).toEqual(['Routine']);
  });

  it('the due query filters on enabled=true and nextRunAt in the past', async () => {
    queueTick({ due: [], activeSpaceIds: [] });
    await invoke('Bearer test-secret');
    const dueChain = supabaseCalls[0].chain;
    expect(dueChain).toContainEqual(['eq', ['enabled', true]]);
    const lte = dueChain.find(([m]) => m === 'lte');
    expect(lte?.[1]?.[0]).toBe('nextRunAt');
  });

  it('a due routine in an active space → fires Modal with the instruction and stamps lastRun', async () => {
    queueTick({
      due: [{ id: 'r1', spaceId: 's1', instruction: 'draft a check-in for quiet deals' }],
      activeSpaceIds: ['s1'],
    });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.due).toBe(1);
    expect(body.fired).toBe(1);
    expect(body.errored).toBe(0);
    expect(body.skipped).toBe(0);

    expect(modalCalls).toHaveLength(1);
    expect(modalCalls[0].body).toEqual({
      space_id: 's1',
      secret: 'agent-secret',
      instruction: 'draft a check-in for quiet deals',
    });

    // The cron stamped the routine — table name + an update with both fields.
    const stamp = supabaseCalls.find(
      (c) => c.table === 'Routine' && c.chain.some(([m]) => m === 'update'),
    );
    expect(stamp).toBeDefined();
    const updateArgs = stamp!.chain.find(([m]) => m === 'update')![1][0] as Record<string, unknown>;
    expect(updateArgs.lastRunStatus).toBe('ok');
    expect(typeof updateArgs.lastRunAt).toBe('string');
  });

  it('a due routine whose space has no live subscription is skipped — no Modal call', async () => {
    queueTick({
      due: [
        { id: 'r_live', spaceId: 's_live', instruction: 'live space routine' },
        { id: 'r_churned', spaceId: 's_churned', instruction: 'churned space routine' },
      ],
      activeSpaceIds: ['s_live'], // s_churned absent → inactive
      runnableCount: 1,
    });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.due).toBe(2);
    expect(body.fired).toBe(1);
    expect(body.skipped).toBe(1);
    expect(modalCalls.map((c) => (c.body as { space_id: string }).space_id)).toEqual(['s_live']);
  });

  it('a Modal HTTP 500 marks the routine errored but still stamps it', async () => {
    queueTick({
      due: [{ id: 'r1', spaceId: 's1', instruction: 'something' }],
      activeSpaceIds: ['s1'],
    });
    modalResponder = () => new Response('upstream blew up', { status: 500 });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.fired).toBe(0);
    expect(body.errored).toBe(1);

    const stamp = supabaseCalls.find(
      (c) => c.table === 'Routine' && c.chain.some(([m]) => m === 'update'),
    );
    const updateArgs = stamp!.chain.find(([m]) => m === 'update')![1][0] as Record<string, unknown>;
    // Even a failed dispatch stamps the row so the trigger advances nextRunAt.
    expect(updateArgs.lastRunStatus).toBe('error');
  });

  it('caps Modal dispatches at 8 in flight even with 20 due routines', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    modalResponder = async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const due = Array.from({ length: 20 }, (_, i) => ({
      id: `r${i}`,
      spaceId: `s${i}`,
      instruction: `routine ${i}`,
    }));
    queueTick({ due, activeSpaceIds: due.map((r) => r.spaceId) });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.fired).toBe(20);
    expect(modalCalls).toHaveLength(20);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(8);
  });
});
