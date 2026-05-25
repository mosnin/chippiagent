/**
 * BP6d — tests for the brokerage-template library + publish fan-out.
 *
 * Runs alongside BP6a (schema), BP6b (APIs) and BP6c (UI) agents, so some
 * route files may not yet exist when this test is first authored; dynamic
 * imports are used so the module-resolution failures surface as test
 * failures rather than import-time crashes that take the whole file out.
 *
 * Mock shape mirrors tests/lib/broker-reviews.test.ts (table-keyed chain
 * mock + per-test override of the auth state). The only new wrinkle is
 * the publish fan-out: the route reads N BrokerageMembership rows then
 * runs an upsert-style flow against MessageTemplate. We keep the supabase
 * chain lax (any combination of select/eq/in/is/insert/update/delete
 * resolves through the same thenable), and steer the fan-out by mocking
 * the agent list directly — option (b) from the test plan.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Supabase table-keyed chain mock ───────────────────────────────────────
interface TableMock {
  rows?: Array<Record<string, unknown>>;
  single?: Record<string, unknown> | null;
  error?: { message: string; code?: string } | null;
  insertError?: { message: string; code?: string } | null;
  updateError?: { message: string; code?: string } | null;
}
let mockByTable: Record<string, TableMock> = {};

// Per-table call counters — used by the publish fan-out assertions when the
// caller prefers (a) counting chain calls over (b) inspecting the agent list.
const fromCalls: Record<string, number> = {};
const insertCalls: Record<string, Array<Record<string, unknown>>> = {};
const updateCalls: Record<string, Array<Record<string, unknown>>> = {};
const deleteCalls: Record<string, number> = {};

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    fromCalls[table] = (fromCalls[table] ?? 0) + 1;

    const override = mockByTable[table] ?? {};
    const rows = override.rows ?? [];
    const single = override.single;
    const error = override.error ?? null;
    const insertError = override.insertError ?? null;
    const updateError = override.updateError ?? null;

    const termThen = Promise.resolve({ data: rows, error });
    const singleThen = Promise.resolve({ data: single ?? rows[0] ?? null, error });
    const insertThen = Promise.resolve({
      data: insertError ? null : single ?? rows[0] ?? null,
      error: insertError,
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
    chain.delete = vi.fn(() => {
      deleteCalls[table] = (deleteCalls[table] ?? 0) + 1;
      return {
        ...chain,
        then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
          termThen.then(r, e),
      };
    });
    chain.insert = vi.fn((payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
      insertCalls[table] = insertCalls[table] ?? [];
      if (Array.isArray(payload)) {
        insertCalls[table].push(...payload);
      } else {
        insertCalls[table].push(payload);
      }
      return {
        ...chain,
        select: vi.fn(() => ({
          single: vi.fn(() => insertThen),
          maybeSingle: vi.fn(() => insertThen),
        })),
        then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
          insertThen.then(r, e),
      };
    });
    chain.upsert = vi.fn((payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
      insertCalls[table] = insertCalls[table] ?? [];
      if (Array.isArray(payload)) {
        insertCalls[table].push(...payload);
      } else {
        insertCalls[table].push(payload);
      }
      return {
        ...chain,
        select: vi.fn(() => ({
          single: vi.fn(() => insertThen),
          maybeSingle: vi.fn(() => insertThen),
        })),
        then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
          insertThen.then(r, e),
      };
    });
    chain.returns = vi.fn(pass);
    chain.maybeSingle = vi.fn(() => singleThen);
    chain.single = vi.fn(() => singleThen);
    chain.then = (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
      termThen.then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

// ── Auth / permission mocks (per-test override) ───────────────────────────
type BrokerRole = 'broker_owner' | 'broker_admin' | 'realtor_member' | null;
interface AuthState {
  clerkId: string | null;
  dbUserId: string;
  brokerageRole: BrokerRole;
  brokerageId: string;
}
let authState: AuthState = {
  clerkId: 'clerk_1',
  dbUserId: 'u_1',
  brokerageRole: 'broker_owner',
  brokerageId: 'b_1',
};

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: authState.clerkId })),
}));

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(async () => {
    if (!authState.clerkId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    return { userId: authState.clerkId };
  }),
}));

vi.mock('@/lib/permissions', () => ({
  requireBroker: vi.fn(async () => {
    if (!authState.brokerageRole || authState.brokerageRole === 'realtor_member') {
      throw new Error('Forbidden: broker access required');
    }
    return {
      membership: { id: 'm_1', role: authState.brokerageRole, userId: authState.dbUserId, brokerageId: authState.brokerageId },
      brokerage: { id: authState.brokerageId, name: 'Test Brokerage', ownerId: authState.dbUserId },
      dbUserId: authState.dbUserId,
    };
  }),
  getBrokerMemberContext: vi.fn(async () => {
    if (!authState.brokerageRole) return null;
    return {
      membership: { id: 'm_1', role: authState.brokerageRole, userId: authState.dbUserId, brokerageId: authState.brokerageId },
      brokerage: { id: authState.brokerageId, name: 'Test Brokerage', ownerId: authState.dbUserId },
      dbUserId: authState.dbUserId,
    };
  }),
}));

vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => undefined) }));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────
function jsonReq(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function postReq(url: string, body: unknown): Request {
  return jsonReq(url, 'POST', body);
}
function patchReq(url: string, body: unknown): Request {
  return jsonReq(url, 'PATCH', body);
}
function deleteReq(url: string): Request {
  return new Request(url, { method: 'DELETE' });
}

beforeEach(() => {
  mockByTable = {};
  for (const key of Object.keys(fromCalls)) delete fromCalls[key];
  for (const key of Object.keys(insertCalls)) delete insertCalls[key];
  for (const key of Object.keys(updateCalls)) delete updateCalls[key];
  for (const key of Object.keys(deleteCalls)) delete deleteCalls[key];
  authState = {
    clerkId: 'clerk_1',
    dbUserId: 'u_1',
    brokerageRole: 'broker_owner',
    brokerageId: 'b_1',
  };
});

// A fully-formed BrokerageTemplate row — used as the `single` payload the
// supabase mock returns from `.single()`/`.maybeSingle()` calls on the
// BrokerageTemplate table. Version/publish counters default to an initial
// (unpublished) state; tests override fields as needed.
function makeTemplateRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 't_1',
    brokerageId: 'b_1',
    name: 'Follow-up #1',
    category: 'follow-up',
    channel: 'email',
    subject: 'Checking in',
    body: 'Hi {{firstName}}, just checking in.',
    version: 1,
    publishedAt: null,
    publishedCount: 0,
    createdByUserId: 'u_1',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// POST /api/broker/templates
// ──────────────────────────────────────────────────────────────────────────
describe('POST /api/broker/templates', () => {
  async function invoke(body: unknown): Promise<Response> {
    const mod = await import('@/app/api/broker/templates/route');
    return mod.POST(postReq('http://x/api/broker/templates', body) as never);
  }

  it('403 when caller role is realtor_member', async () => {
    authState.brokerageRole = 'realtor_member';
    const res = await invoke({
      name: 'Intro',
      category: 'intro',
      channel: 'email',
      subject: 'Hi',
      body: 'Welcome!',
    });
    expect(res.status).toBe(403);
  });

  it('400 when name is missing', async () => {
    const res = await invoke({
      // no name
      category: 'intro',
      channel: 'email',
      subject: 'Hi',
      body: 'Welcome!',
    });
    expect(res.status).toBe(400);
  });

  it('400 when body > 5000 chars', async () => {
    const res = await invoke({
      name: 'Huge',
      category: 'intro',
      channel: 'email',
      subject: 'Hi',
      body: 'x'.repeat(5001),
    });
    expect(res.status).toBe(400);
  });

  it('400 when category is not in the enum', async () => {
    const res = await invoke({
      name: 'Bad category',
      category: 'bogus-category',
      channel: 'email',
      subject: 'Hi',
      body: 'Welcome!',
    });
    expect(res.status).toBe(400);
  });

  it('201 on happy path — inserted row has version=1', async () => {
    // The route inserts and selects the row back. Steer the BrokerageTemplate
    // `single` payload so the returned body matches what we'd expect the DB
    // to have written.
    mockByTable.BrokerageTemplate = {
      single: makeTemplateRow({
        id: 't_new',
        name: 'Intro #1',
        category: 'intro',
        channel: 'email',
        subject: 'Hi',
        body: 'Welcome!',
        version: 1,
        publishedAt: null,
        publishedCount: 0,
      }),
    };

    const res = await invoke({
      name: 'Intro #1',
      category: 'intro',
      channel: 'email',
      subject: 'Hi',
      body: 'Welcome!',
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.version).toBe(1);

    // The insert payload should have been primed with version=1.
    const inserted = insertCalls.BrokerageTemplate ?? [];
    expect(inserted.length).toBeGreaterThanOrEqual(1);
    const lastInsert = inserted[inserted.length - 1] ?? {};
    expect(lastInsert.version).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// PATCH /api/broker/templates/[id]
// ──────────────────────────────────────────────────────────────────────────
describe('PATCH /api/broker/templates/[id]', () => {
  async function invoke(id: string, body: unknown): Promise<Response> {
    // The [id]/route.ts file is owned by BP6b. If it doesn't exist yet,
    // the dynamic import will throw — which we want (per plan: don't paper
    // over). The test harness reports module-resolution as a test failure.
    const mod = await import('@/app/api/broker/templates/[id]/route');
    return mod.PATCH(patchReq(`http://x/api/broker/templates/${id}`, body) as never, {
      params: Promise.resolve({ id }),
    });
  }

  it('404 when row not in caller brokerage', async () => {
    mockByTable.BrokerageTemplate = { single: null };
    const res = await invoke('t_missing', { body: 'new body' });
    expect(res.status).toBe(404);
  });

  it('version increments when body changes (1 → 2)', async () => {
    // First .single() = lookup of existing row at version 1.
    // The route then PATCHes; our mock's .update(...).select().single() will
    // return the same `single` payload (good enough — we assert on the update
    // payload, not the response body).
    mockByTable.BrokerageTemplate = {
      single: makeTemplateRow({
        id: 't_1',
        brokerageId: 'b_1',
        body: 'OLD body',
        version: 1,
      }),
    };

    const res = await invoke('t_1', { body: 'NEW body' });
    // Happy path should be 200. If the API diverged and returns something
    // else, the assertion below will make that obvious.
    expect(res.status).toBe(200);

    const updates = updateCalls.BrokerageTemplate ?? [];
    expect(updates.length).toBeGreaterThanOrEqual(1);
    const payload = updates[updates.length - 1] ?? {};
    // Either `version: 2` (literal) or an `increment: 1` style bump — we
    // assert on the literal write which is the straight-forward impl.
    expect(payload.version).toBe(2);
    expect(payload.body).toBe('NEW body');
  });

  it('empty patch body → 400 rather than bumping version', async () => {
    // Row exists so we can be sure the 400 comes from validation, not the
    // not-found branch.
    mockByTable.BrokerageTemplate = {
      single: makeTemplateRow({ id: 't_1', brokerageId: 'b_1', version: 1 }),
    };

    const res = await invoke('t_1', {});
    expect(res.status).toBe(400);

    // And no update should have fired — version must NOT have been bumped
    // just because `updatedAt` would change.
    const updates = updateCalls.BrokerageTemplate ?? [];
    expect(updates.length).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// DELETE /api/broker/templates/[id]
// ──────────────────────────────────────────────────────────────────────────
describe('DELETE /api/broker/templates/[id]', () => {
  async function invoke(id: string): Promise<Response> {
    const mod = await import('@/app/api/broker/templates/[id]/route');
    return mod.DELETE(deleteReq(`http://x/api/broker/templates/${id}`) as never, {
      params: Promise.resolve({ id }),
    });
  }

  it('204 on happy path', async () => {
    mockByTable.BrokerageTemplate = {
      single: makeTemplateRow({ id: 't_1', brokerageId: 'b_1' }),
    };
    const res = await invoke('t_1');
    expect(res.status).toBe(204);
    expect(deleteCalls.BrokerageTemplate ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('404 when row not in brokerage', async () => {
    mockByTable.BrokerageTemplate = { single: null };
    const res = await invoke('t_missing');
    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/broker/templates/[id]/publish
// ──────────────────────────────────────────────────────────────────────────
describe('POST /api/broker/templates/[id]/publish', () => {
  async function invoke(id: string): Promise<Response> {
    const mod = await import('@/app/api/broker/templates/[id]/publish/route');
    return mod.POST(postReq(`http://x/api/broker/templates/${id}/publish`, {}) as never, {
      params: Promise.resolve({ id }),
    });
  }

  it('404 when template not found', async () => {
    mockByTable.BrokerageTemplate = { single: null };
    const res = await invoke('t_missing');
    expect(res.status).toBe(404);
  });

  it('403 when caller role is realtor_member', async () => {
    authState.brokerageRole = 'realtor_member';
    // Seed template so the failure definitely comes from the role gate.
    mockByTable.BrokerageTemplate = {
      single: makeTemplateRow({ id: 't_1', brokerageId: 'b_1' }),
    };
    const res = await invoke('t_1');
    expect(res.status).toBe(403);
  });

  it('happy path: pushes to 2 agents, skips 1 with sourceVersion=null; publishedCount=2', async () => {
    // Template exists.
    mockByTable.BrokerageTemplate = {
      single: makeTemplateRow({
        id: 't_1',
        brokerageId: 'b_1',
        version: 3,
        body: 'Hello {{firstName}}',
      }),
    };

    // BrokerageMembership list — three realtor_member rows.
    mockByTable.BrokerageMembership = {
      rows: [
        { id: 'm_a', userId: 'u_a', brokerageId: 'b_1', role: 'realtor_member' },
        { id: 'm_b', userId: 'u_b', brokerageId: 'b_1', role: 'realtor_member' },
        { id: 'm_c', userId: 'u_c', brokerageId: 'b_1', role: 'realtor_member' },
      ],
    };

    // Space rows — each agent has one space in brokerage b_1.
    mockByTable.Space = {
      rows: [
        { id: 'space_a', ownerId: 'u_a', brokerageId: 'b_1' },
        { id: 'space_b', ownerId: 'u_b', brokerageId: 'b_1' },
        { id: 'space_c', ownerId: 'u_c', brokerageId: 'b_1' },
      ],
    };

    // MessageTemplate look-up keyed by spaceId. Agent c's copy has
    // sourceVersion=null (locally edited) — it should be skipped.
    mockByTable.MessageTemplate = {
      rows: [
        {
          id: 'mt_a',
          spaceId: 'space_a',
          sourceTemplateId: 't_1',
          sourceVersion: 2,
        },
        {
          id: 'mt_b',
          spaceId: 'space_b',
          sourceTemplateId: 't_1',
          sourceVersion: 2,
        },
        {
          id: 'mt_c',
          spaceId: 'space_c',
          sourceTemplateId: 't_1',
          sourceVersion: null,
        },
      ],
    };

    const res = await invoke('t_1');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { pushed: number; skipped: number; publishedAt: string };
    expect(json.pushed).toBe(2);
    expect(json.skipped).toBe(1);
    expect(typeof json.publishedAt).toBe('string');

    // BrokerageTemplate should have been updated with publishedCount=2 (and
    // publishedAt set).
    const tmplUpdates = updateCalls.BrokerageTemplate ?? [];
    expect(tmplUpdates.length).toBeGreaterThanOrEqual(1);
    const lastTmplUpdate = tmplUpdates[tmplUpdates.length - 1] ?? {};
    expect(lastTmplUpdate.publishedCount).toBe(2);
    expect(lastTmplUpdate.publishedAt).toBeTruthy();
  });

  it('pushes into a fresh agent (no prior MessageTemplate) via INSERT', async () => {
    // Template exists.
    mockByTable.BrokerageTemplate = {
      single: makeTemplateRow({
        id: 't_1',
        brokerageId: 'b_1',
        version: 5,
      }),
    };
    // One agent in the brokerage.
    mockByTable.BrokerageMembership = {
      rows: [
        { id: 'm_fresh', userId: 'u_fresh', brokerageId: 'b_1', role: 'realtor_member' },
      ],
    };
    // Agent's space.
    mockByTable.Space = {
      rows: [{ id: 'space_fresh', ownerId: 'u_fresh', brokerageId: 'b_1' }],
    };
    // No MessageTemplate exists for this agent yet — rows: [] is the default
    // but we spell it out for clarity.
    mockByTable.MessageTemplate = { rows: [] };

    const res = await invoke('t_1');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { pushed: number; skipped: number };
    // Either the fresh-insert branch counts as "pushed" or — if the API
    // agent decided fresh inserts are opt-in only — "skipped". The spec
    // says fresh copies ARE inserted, so we assert pushed>=1.
    expect(json.pushed).toBeGreaterThanOrEqual(1);

    // And at least one MessageTemplate insert should have fanned out.
    const inserts = insertCalls.MessageTemplate ?? [];
    expect(inserts.length).toBeGreaterThanOrEqual(1);
    const payload = inserts[0] ?? {};
    expect(payload.userId).toBe('u_fresh');
    expect(payload.sourceTemplateId).toBe('t_1');
    expect(payload.sourceVersion).toBe(5);
  });
});
