/**
 * Route-level integration test for `GET /api/cron/agent-sweep`.
 *
 * The cron iterates every active space, fires a Modal webhook per eligible
 * space, dedupes via Redis with a 3h TTL, skips spaces with a backlog of
 * pending drafts, and caps parallel Modal calls at 8. Production telemetry is
 * a JSON summary. None of that was tested before this file existed.
 *
 * Mock strategy:
 *   - `@/lib/supabase`: chainable thenable, two `from()` reads per request
 *     (Space list, AgentDraft count). Mirrors `tests/api/agent-morning.test.ts`.
 *   - `globalThis.fetch`: single spy, routed by URL. Modal calls are recorded
 *     for assertion; KV `/get/...` and `/set/...` URLs are answered from a
 *     test-controlled in-memory map.
 *   - Env vars: set in `beforeEach`, restored in `afterEach`.
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
    const passthrough = ['select', 'eq', 'in', 'is', 'not', 'gte', 'lt', 'order', 'limit', 'contains'];
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
import { GET } from '@/app/api/cron/agent-sweep/route';

// ── Env helpers ─────────────────────────────────────────────────────────────
const ENV_KEYS = [
  'CRON_SECRET',
  'CRON_SWEEP_DISABLED',
  'MODAL_WEBHOOK_URL',
  'AGENT_INTERNAL_SECRET',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
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
type ModalCall = { url: string; body: unknown; headers: Record<string, string> };
let modalCalls: ModalCall[] = [];
let kvStore: Map<string, string> = new Map();
let modalResponder: (spaceId: string) => Promise<Response> | Response = () =>
  new Response(JSON.stringify({ ok: true }), { status: 200 });

function buildFetchMock() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

    // KV REST API: /get/<key> and /set/<key>/<value>?EX=...
    if (process.env.KV_REST_API_URL && url.startsWith(process.env.KV_REST_API_URL)) {
      const path = url.slice(process.env.KV_REST_API_URL.length);
      if (path.startsWith('/get/')) {
        const key = decodeURIComponent(path.slice('/get/'.length));
        const result = kvStore.has(key) ? kvStore.get(key)! : null;
        return new Response(JSON.stringify({ result }), { status: 200 });
      }
      if (path.startsWith('/set/')) {
        const rest = path.slice('/set/'.length);
        const qIdx = rest.indexOf('?');
        const beforeQuery = qIdx >= 0 ? rest.slice(0, qIdx) : rest;
        const [encKey, encVal] = beforeQuery.split('/');
        kvStore.set(decodeURIComponent(encKey), decodeURIComponent(encVal ?? ''));
        return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }

    // Modal webhook
    if (process.env.MODAL_WEBHOOK_URL && url === process.env.MODAL_WEBHOOK_URL) {
      const headers: Record<string, string> = {};
      const rawHeaders = init?.headers ?? {};
      if (rawHeaders instanceof Headers) {
        rawHeaders.forEach((v, k) => (headers[k] = v));
      } else if (Array.isArray(rawHeaders)) {
        for (const [k, v] of rawHeaders) headers[k] = v;
      } else {
        Object.assign(headers, rawHeaders as Record<string, string>);
      }
      let body: unknown = null;
      if (typeof init?.body === 'string') {
        try { body = JSON.parse(init.body); } catch { body = init.body; }
      }
      const spaceId = (body as { space_id?: string } | null)?.space_id ?? '';
      modalCalls.push({ url, body, headers });
      return Promise.resolve(modalResponder(spaceId));
    }

    return new Response('unmocked', { status: 599 });
  });
}

let fetchSpy: ReturnType<typeof buildFetchMock>;

// ── Helpers ─────────────────────────────────────────────────────────────────
function makeRequest(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.Authorization = authHeader;
  return new Request('http://localhost/api/cron/agent-sweep', { method: 'GET', headers });
}

function invoke(authHeader?: string) {
  const req = makeRequest(authHeader);
  return GET(req as unknown as Parameters<typeof GET>[0]);
}

/** Queue the two supabase reads: spaces list, then pending drafts list. */
function queueSweep(opts: {
  spaces: Array<{ id: string; slug: string }>;
  pending: Array<{ spaceId: string }>;
}) {
  supabaseQueue = [
    { data: opts.spaces, error: null },
    { data: opts.pending, error: null },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseQueue = [];
  supabaseCalls.length = 0;
  modalCalls = [];
  kvStore = new Map();
  modalResponder = () => new Response(JSON.stringify({ ok: true }), { status: 200 });

  snapshotEnv();
  process.env.CRON_SECRET = 'test-secret';
  delete process.env.CRON_SWEEP_DISABLED;
  process.env.MODAL_WEBHOOK_URL = 'https://modal.example/webhook';
  process.env.AGENT_INTERNAL_SECRET = 'agent-secret';
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;

  fetchSpy = buildFetchMock();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  restoreEnv();
  vi.unstubAllGlobals();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/cron/agent-sweep', () => {
  it('rejects when Authorization header is missing → 401', async () => {
    queueSweep({ spaces: [], pending: [] });
    const res = await invoke(undefined);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(modalCalls).toHaveLength(0);
    // Never made it past the auth gate, so supabase shouldn't have been hit.
    expect(supabaseCalls).toHaveLength(0);
  });

  it('rejects when Authorization header carries the wrong secret → 401', async () => {
    const res = await invoke('Bearer wrong-secret');
    expect(res.status).toBe(401);
    expect(modalCalls).toHaveLength(0);
    expect(supabaseCalls).toHaveLength(0);
  });

  it('rejects when CRON_SECRET env var is unset → 500 (server misconfigured)', async () => {
    delete process.env.CRON_SECRET;
    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Server misconfigured' });
    expect(modalCalls).toHaveLength(0);
  });

  it('CRON_SWEEP_DISABLED=1 short-circuits → 200 {status:"disabled"}, no Modal calls', async () => {
    process.env.CRON_SWEEP_DISABLED = '1';
    // Even with eligible spaces queued, the kill switch must short-circuit
    // before a single supabase read.
    queueSweep({
      spaces: [{ id: 'space_a', slug: 'a' }, { id: 'space_b', slug: 'b' }],
      pending: [],
    });

    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'disabled' });
    expect(modalCalls).toHaveLength(0);
    expect(supabaseCalls).toHaveLength(0);
  });

  it('Modal webhook env vars missing → 500 misconfigured (no DB or Modal calls)', async () => {
    delete process.env.MODAL_WEBHOOK_URL;
    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.status).toBe('misconfigured');
    expect(modalCalls).toHaveLength(0);
    expect(supabaseCalls).toHaveLength(0);
  });

  it('empty active-space list → 200 with zeroed telemetry, no Modal calls', async () => {
    queueSweep({ spaces: [], pending: [] });
    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ totalSpaces: 0, started: 0, skipped: 0, errored: 0 });
    expect(modalCalls).toHaveLength(0);
    // Supabase Space query happened; AgentDraft count was correctly skipped
    // because the route bails after the empty space list.
    expect(supabaseCalls.map((c) => c.table)).toEqual(['Space']);
  });

  it('eligible space → fires Modal webhook with the right URL, headers, and JSON body', async () => {
    queueSweep({
      spaces: [{ id: 'space_one', slug: 'one' }],
      pending: [],
    });

    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalSpaces).toBe(1);
    expect(body.started).toBe(1);
    expect(body.skipped).toBe(0);
    expect(body.errored).toBe(0);

    expect(modalCalls).toHaveLength(1);
    expect(modalCalls[0].url).toBe('https://modal.example/webhook');
    expect(modalCalls[0].body).toEqual({ space_id: 'space_one', secret: 'agent-secret' });
    // Authorization header is case-insensitive on the wire; the route sets
    // 'Authorization' but Headers normalises to lowercase keys.
    const authValues = Object.entries(modalCalls[0].headers)
      .filter(([k]) => k.toLowerCase() === 'authorization')
      .map(([, v]) => v);
    expect(authValues).toContain('Bearer agent-secret');
  });

  it('skips a space with ≥10 pending drafts (reason: backlog); does not call Modal for it', async () => {
    const pending = Array.from({ length: 10 }, () => ({ spaceId: 'space_full' }));
    queueSweep({
      spaces: [
        { id: 'space_full', slug: 'full' },
        { id: 'space_ok', slug: 'ok' },
      ],
      pending,
    });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.totalSpaces).toBe(2);
    expect(body.started).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.skipReasons).toEqual({ backlog: 1 });
    expect(modalCalls.map((c) => (c.body as { space_id: string }).space_id)).toEqual(['space_ok']);
  });

  it('skips a space whose Redis sweep key already exists (reason: recent)', async () => {
    process.env.KV_REST_API_URL = 'https://kv.example';
    process.env.KV_REST_API_TOKEN = 'kv-token';
    // Pre-seed: space_recent was swept already; space_fresh has no key.
    kvStore.set('agent:sweep:last:space_recent', String(Date.now()));

    queueSweep({
      spaces: [
        { id: 'space_recent', slug: 'recent' },
        { id: 'space_fresh', slug: 'fresh' },
      ],
      pending: [],
    });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.totalSpaces).toBe(2);
    expect(body.started).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.skipReasons).toEqual({ recent: 1 });

    // Modal was called only for the fresh space.
    expect(modalCalls.map((c) => (c.body as { space_id: string }).space_id)).toEqual(['space_fresh']);
    // And the route marked space_fresh swept (so the next tick would skip it).
    expect(kvStore.has('agent:sweep:last:space_fresh')).toBe(true);
  });

  it('one Modal call rejecting marks that space errored; other spaces still process', async () => {
    queueSweep({
      spaces: [
        { id: 'space_good', slug: 'good' },
        { id: 'space_bad', slug: 'bad' },
        { id: 'space_alsogood', slug: 'alsogood' },
      ],
      pending: [],
    });
    modalResponder = (spaceId) => {
      if (spaceId === 'space_bad') return Promise.reject(new Error('boom'));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.totalSpaces).toBe(3);
    expect(body.started).toBe(2);
    expect(body.errored).toBe(1);
    expect(body.skipped).toBe(0);
    // All three spaces had Modal called (the bad one threw, but it was attempted).
    expect(modalCalls.map((c) => (c.body as { space_id: string }).space_id).sort()).toEqual([
      'space_alsogood',
      'space_bad',
      'space_good',
    ]);
  });

  it('Modal HTTP 500 (rejected by Modal but resolved fetch) → space marked errored', async () => {
    queueSweep({
      spaces: [{ id: 'space_x', slug: 'x' }],
      pending: [],
    });
    modalResponder = () => new Response('upstream blew up', { status: 500 });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.errored).toBe(1);
    expect(body.started).toBe(0);
  });

  it('caps parallel Modal calls at 8 even with 20 eligible spaces', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    modalResponder = async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Yield long enough that all 8 workers latch before any finishes.
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const spaces = Array.from({ length: 20 }, (_, i) => ({ id: `space_${i}`, slug: `s${i}` }));
    queueSweep({ spaces, pending: [] });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.totalSpaces).toBe(20);
    expect(body.started).toBe(20);
    expect(modalCalls).toHaveLength(20);
    expect(maxInFlight).toBeGreaterThan(1); // sanity: actually parallel
    expect(maxInFlight).toBeLessThanOrEqual(8);
  });
});
