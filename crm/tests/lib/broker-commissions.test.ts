import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Brokerage, BrokerageMembership } from '@/lib/types';

// ── Supabase mock ─────────────────────────────────────────────────────────
// Mirrors the table-keyed FIFO chain mock used in broker-offboard.test.ts:
// each table carries a queue of "next result" entries. `.maybeSingle()`
// consumes the front of the singles queue for single-row lookups; the
// thenable chain drains the rows queue for array lookups (`.in()`, `.gte()`,
// `.order()`, etc.).
//
// We additionally track update/insert payloads per-table so a PATCH/GET route
// can assert that the SET payload contained the recomputed amounts.

type SingleResult = { data: Record<string, unknown> | null; error: { message: string } | null };
type RowsResult = { data: Array<Record<string, unknown>>; error: { message: string } | null };

interface TableState {
  singles: SingleResult[];
  rows: RowsResult[];
  updatePayloads: Array<Record<string, unknown>>;
  insertPayloads: Array<Record<string, unknown>>;
}

const tableState: Record<string, TableState> = {};

function ensureTable(table: string): TableState {
  if (!tableState[table]) {
    tableState[table] = { singles: [], rows: [], updatePayloads: [], insertPayloads: [] };
  }
  return tableState[table];
}

function queueSingle(
  table: string,
  data: Record<string, unknown> | null,
  error: { message: string } | null = null,
): void {
  ensureTable(table).singles.push({ data, error });
}

function queueRows(
  table: string,
  data: Array<Record<string, unknown>>,
  error: { message: string } | null = null,
): void {
  ensureTable(table).rows.push({ data, error });
}

// rpc queue (unused here but kept for structural parity with broker-offboard).
type RpcResult = { data: unknown; error: { message: string } | null };
const rpcQueue: RpcResult[] = [];

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async (_name: string, _args: Record<string, unknown>) => {
    const next = rpcQueue.shift();
    if (!next) return { data: null, error: null };
    return next;
  }),
}));

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const state = ensureTable(table);

    const getNextSingle = (): SingleResult => {
      const entry = state.singles.shift();
      return entry ?? { data: null, error: null };
    };
    const getNextRows = (): RowsResult => {
      const entry = state.rows.shift();
      return entry ?? { data: [], error: null };
    };

    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      is: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      lt: vi.fn(() => chain),
      gt: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      update: vi.fn((payload: Record<string, unknown>) => {
        state.updatePayloads.push(payload);
        return chain;
      }),
      insert: vi.fn((payload: Record<string, unknown>) => {
        state.insertPayloads.push(payload);
        const p = Promise.resolve({ data: null, error: null });
        return {
          ...chain,
          then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) => p.then(r, e),
        };
      }),
      maybeSingle: vi.fn(() => Promise.resolve(getNextSingle())),
      single: vi.fn(() => Promise.resolve(getNextSingle())),
      // Thenable at the end of a chain that didn't go through maybeSingle —
      // e.g. `.in()`, `.gte().lte().order()`.
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(getNextRows()).then(resolve, reject),
    };
    return chain;
  }

  return {
    supabase: {
      from: vi.fn((table: string) => makeChain(table)),
      rpc: rpcMock,
    },
  };
});

// ── requireBroker mock ─────────────────────────────────────────────────────
let requireBrokerImpl: () => Promise<{
  brokerage: Brokerage;
  membership: BrokerageMembership;
  dbUserId: string;
}>;

vi.mock('@/lib/permissions', () => ({
  requireBroker: vi.fn(() => requireBrokerImpl()),
}));

// ── audit + clerk + logger ─────────────────────────────────────────────────
const { auditMock } = vi.hoisted(() => ({ auditMock: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit', () => ({ audit: auditMock }));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'clerk_caller' })),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Routes under test ──────────────────────────────────────────────────────
// Imported lazily inside tests via dynamic import? No — the offboard test
// imports statically. We do the same and tolerate the route files possibly
// not existing yet by deferring import to inside the describe blocks via
// a helper; however the instructions state to mirror offboard.test.ts, so
// we import statically. If the route modules don't yet exist at test time,
// the test run will surface that as a module-resolution error — expected in
// parallel development.
import { PATCH } from '@/app/api/broker/commissions/ledger/[id]/route';
import { GET } from '@/app/api/broker/commissions/export/route';

// ── Fixtures / helpers ─────────────────────────────────────────────────────
function makeBrokerage(overrides: Partial<Brokerage> = {}): Brokerage {
  return {
    id: 'brk_1',
    name: 'Acme Realty',
    ownerId: 'u_owner',
    status: 'active',
    websiteUrl: null,
    logoUrl: null,
    joinCode: null,
    privacyPolicyHtml: null,
    brokerageFormConfig: null,
    brokerageRentalFormConfig: null,
    brokerageBuyerFormConfig: null,
    brokerageRentalScoringModel: null,
    brokerageBuyerScoringModel: null,
    plan: 'starter',
    seatLimit: 5,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripeSubscriptionStatus: 'inactive',
    stripePeriodEnd: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    brokerageLicenseNumber: null,
    brokerageFairHousingNotice: null,
    brokerageShowEqualHousingMark: false,
    ...overrides,
  };
}

function makeMembership(overrides: Partial<BrokerageMembership> = {}): BrokerageMembership {
  return {
    id: 'mem_caller',
    brokerageId: 'brk_1',
    userId: 'u_caller',
    role: 'broker_owner',
    invitedById: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function setCaller(
  role: 'broker_owner' | 'broker_admin' | 'realtor_member' = 'broker_owner',
  dbUserId = 'u_caller',
): void {
  requireBrokerImpl = async () => ({
    brokerage: makeBrokerage(),
    membership: makeMembership({ role, userId: dbUserId }),
    dbUserId,
  });
}

// ── PATCH helpers ──────────────────────────────────────────────────────────
interface PatchBody {
  status?: string;
  payoutAt?: string | null;
  agentRate?: number;
  brokerRate?: number;
  referralRate?: number;
  referralUserId?: string | null;
  notes?: string | null;
}

function buildPatchRequest(id: string, body: PatchBody | string | undefined): Request {
  const init: RequestInit = {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
  };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return new Request(`http://localhost/api/broker/commissions/ledger/${id}`, init);
}

async function invokePatch(
  id: string,
  body: PatchBody | string | undefined,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const req = buildPatchRequest(id, body);
  const res = await PATCH(
    req as unknown as Parameters<typeof PATCH>[0],
    { params: Promise.resolve({ id }) },
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

// ── GET helpers ────────────────────────────────────────────────────────────
function buildExportRequest(query: string): Request {
  return new Request(`http://localhost/api/broker/commissions/export${query}`);
}

async function invokeGet(
  query: string,
): Promise<{ status: number; headers: Headers; text: string }> {
  const req = buildExportRequest(query);
  const res = await GET(req as unknown as Parameters<typeof GET>[0]);
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

beforeEach(() => {
  for (const key of Object.keys(tableState)) delete tableState[key];
  rpcQueue.length = 0;
  rpcMock.mockClear();
  auditMock.mockClear();
  setCaller('broker_owner');
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('PATCH /api/broker/commissions/ledger/[id]', () => {
  describe('authorization', () => {
    it('returns 403 when requireBroker throws', async () => {
      requireBrokerImpl = async () => {
        throw new Error('Forbidden: broker access required');
      };
      const { status, json } = await invokePatch('led_1', { status: 'paid' });
      expect(status).toBe(403);
      expect(json).toEqual({ error: 'Forbidden' });
    });

    it('returns 403 when the caller is a realtor_member', async () => {
      setCaller('realtor_member');
      const { status, json } = await invokePatch('led_1', { status: 'paid' });
      expect(status).toBe(403);
      expect(typeof json.error).toBe('string');
    });
  });

  describe('validation', () => {
    it('returns 400 when body has no fields', async () => {
      const { status, json } = await invokePatch('led_1', {});
      expect(status).toBe(400);
      expect(typeof json.error).toBe('string');
    });

    it('returns 400 when agentRate is 150 (out of [0,100])', async () => {
      // Seed the ledger lookup so the validation check is what actually trips.
      queueSingle('CommissionLedger', {
        id: 'led_1',
        brokerageId: 'brk_1',
        dealValue: 500000,
        dealId: 'deal_1',
        agentRate: 2.5,
        brokerRate: 0.5,
        referralRate: 0,
        referralUserId: null,
        agentAmount: 12500,
        brokerAmount: 2500,
        referralAmount: 0,
        status: 'pending',
      });
      const { status, json } = await invokePatch('led_1', { agentRate: 150 });
      expect(status).toBe(400);
      expect(typeof json.error).toBe('string');
    });
  });

  describe('lookups', () => {
    it('returns 404 when the ledger row belongs to a different brokerage', async () => {
      queueSingle('CommissionLedger', null);
      const { status, json } = await invokePatch('led_x', { status: 'paid' });
      expect(status).toBe(404);
      expect(typeof json.error).toBe('string');
    });

    it('returns 404 when referralUserId does not resolve to a User', async () => {
      queueSingle('CommissionLedger', {
        id: 'led_1',
        brokerageId: 'brk_1',
        dealValue: 500000,
        dealId: 'deal_1',
        agentRate: 2.5,
        brokerRate: 0.5,
        referralRate: 0,
        referralUserId: null,
        agentAmount: 12500,
        brokerAmount: 2500,
        referralAmount: 0,
        status: 'pending',
      });
      queueSingle('User', null);
      const { status, json } = await invokePatch('led_1', {
        referralRate: 1,
        referralUserId: 'u_ghost',
      });
      expect(status).toBe(404);
      expect(typeof json.error).toBe('string');
    });
  });

  describe('happy paths', () => {
    it('status-change only: returns 200, fires UPDATE audit, leaves amounts unchanged', async () => {
      // Lookup: existing ledger row in this brokerage.
      queueSingle('CommissionLedger', {
        id: 'led_1',
        brokerageId: 'brk_1',
        dealValue: 500000,
        dealId: 'deal_1',
        agentRate: 2.5,
        brokerRate: 0.5,
        referralRate: 0,
        referralUserId: null,
        agentAmount: 12500,
        brokerAmount: 2500,
        referralAmount: 0,
        status: 'pending',
      });
      // Update returns the updated row.
      queueSingle('CommissionLedger', {
        id: 'led_1',
        brokerageId: 'brk_1',
        dealValue: 500000,
        dealId: 'deal_1',
        agentRate: 2.5,
        brokerRate: 0.5,
        referralRate: 0,
        referralUserId: null,
        agentAmount: 12500,
        brokerAmount: 2500,
        referralAmount: 0,
        status: 'paid',
      });

      const { status, json } = await invokePatch('led_1', { status: 'paid' });
      expect(status).toBe(200);
      expect(json.id).toBe('led_1');
      expect(json.status).toBe('paid');

      // Audit fired with action UPDATE.
      expect(auditMock).toHaveBeenCalledTimes(1);
      const auditArgs = (auditMock.mock.calls as unknown[][])[0][0] as {
        action: string;
        resource: string;
        resourceId: string;
      };
      expect(auditArgs.action).toBe('UPDATE');
      expect(auditArgs.resource).toBe('CommissionLedger');
      expect(auditArgs.resourceId).toBe('led_1');

      // The update payload should NOT include recomputed amounts when no rate
      // changed.
      const payloads = tableState['CommissionLedger']?.updatePayloads ?? [];
      expect(payloads.length).toBeGreaterThanOrEqual(1);
      const lastPayload = payloads[payloads.length - 1] ?? {};
      // Amount fields should be absent OR unchanged from the existing values.
      if ('agentAmount' in lastPayload) {
        expect(lastPayload.agentAmount).toBe(12500);
      }
      if ('brokerAmount' in lastPayload) {
        expect(lastPayload.brokerAmount).toBe(2500);
      }
    });

    it('agentRate 2.5 → 3.0 on $500,000 deal recomputes agentAmount to 15000', async () => {
      queueSingle('CommissionLedger', {
        id: 'led_1',
        brokerageId: 'brk_1',
        dealValue: 500000,
        dealId: 'deal_1',
        agentRate: 2.5,
        brokerRate: 0.5,
        referralRate: 0,
        referralUserId: null,
        agentAmount: 12500,
        brokerAmount: 2500,
        referralAmount: 0,
        status: 'pending',
      });
      // Updated row returned after the write.
      queueSingle('CommissionLedger', {
        id: 'led_1',
        brokerageId: 'brk_1',
        dealValue: 500000,
        dealId: 'deal_1',
        agentRate: 3.0,
        brokerRate: 0.5,
        referralRate: 0,
        referralUserId: null,
        agentAmount: 15000,
        brokerAmount: 2500,
        referralAmount: 0,
        status: 'pending',
      });

      const { status, json } = await invokePatch('led_1', { agentRate: 3.0 });
      expect(status).toBe(200);
      expect(json.agentAmount).toBe(15000);

      // The supabase .update(...) call should have been given the recomputed
      // agentAmount so the DB and the returned row agree.
      const payloads = tableState['CommissionLedger']?.updatePayloads ?? [];
      expect(payloads.length).toBeGreaterThanOrEqual(1);
      const lastPayload = payloads[payloads.length - 1] ?? {};
      expect(lastPayload.agentRate).toBe(3.0);
      // 500,000 * 3.0% = 15,000.
      expect(Number(lastPayload.agentAmount)).toBeCloseTo(15000, 2);

      expect(auditMock).toHaveBeenCalledTimes(1);
    });
  });
});

describe('GET /api/broker/commissions/export', () => {
  it('returns 400 when month param is missing', async () => {
    const { status } = await invokeGet('?format=csv');
    expect(status).toBe(400);
  });

  it('returns 400 when format=pdf', async () => {
    const { status } = await invokeGet('?month=2026-05&format=pdf');
    expect(status).toBe(400);
  });

  it('returns 200 with header-only CSV when no ledger rows match the month', async () => {
    queueRows('CommissionLedger', []);
    const { status, headers, text } = await invokeGet('?month=2026-05&format=csv');
    expect(status).toBe(200);
    expect(headers.get('content-type') ?? '').toMatch(/text\/csv/i);
    // One header line; possibly a trailing newline — so splitting yields
    // either 1 or 2 entries (with the second being empty).
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    expect(lines.length).toBe(1);
  });

  it('returns header + N rows for a matched month and csv-escapes titles with commas', async () => {
    queueRows('CommissionLedger', [
      {
        id: 'led_1',
        brokerageId: 'brk_1',
        dealId: 'deal_1',
        dealValue: 500000,
        deal: { id: 'deal_1', title: '123 Main St, Apt 4B' },
        agent: null,
        agentRate: 2.5,
        brokerRate: 0.5,
        referralRate: 0,
        agentAmount: 12500,
        brokerAmount: 2500,
        referralAmount: 0,
        status: 'paid',
        payoutAt: '2026-05-15T00:00:00.000Z',
        closedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'led_2',
        brokerageId: 'brk_1',
        dealId: 'deal_2',
        dealValue: 300000,
        deal: { id: 'deal_2', title: 'Plain Title' },
        agent: null,
        agentRate: 2.0,
        brokerRate: 0.5,
        referralRate: 0,
        agentAmount: 6000,
        brokerAmount: 1500,
        referralAmount: 0,
        status: 'pending',
        payoutAt: null,
        closedAt: null,
      },
    ]);

    const { status, text } = await invokeGet('?month=2026-05&format=csv');
    expect(status).toBe(200);

    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    // Header + 2 rows.
    expect(lines.length).toBe(3);

    // First data row should contain the escaped title. The exact byte-for-byte
    // escaping convention (RFC 4180 double-quote the whole field when it has a
    // comma) is the most likely implementation; assert on shape not byte.
    const firstRow = lines[1] ?? '';
    // Either the whole field is double-quoted, or the comma was stripped.
    // We assert the robust invariant: the CSV has the expected column count
    // (no unescaped comma splitting "123 Main St, Apt 4B" into two cells).
    // Count of top-level commas (not inside double-quotes) matches header.
    const headerCommaCount = (lines[0] ?? '').split(',').length;
    const dataCellCount = splitCsvRow(firstRow).length;
    expect(dataCellCount).toBe(headerCommaCount);

    // Additionally, the raw text should either contain the quoted form or
    // contain the substring '123 Main St, Apt 4B' inside quotes.
    expect(text).toMatch(/"123 Main St, Apt 4B"/);
  });

  it('Content-Disposition header includes .csv and the month', async () => {
    queueRows('CommissionLedger', []);
    const { headers } = await invokeGet('?month=2026-05&format=csv');
    const disposition = headers.get('content-disposition') ?? '';
    expect(disposition).toMatch(/\.csv/);
    expect(disposition).toContain('2026-05');
  });
});

// ── Small RFC-4180-style CSV row splitter used only for assertions. ───────
// Handles comma separators and double-quoted fields (with embedded commas).
function splitCsvRow(row: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i += 1) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"') {
        if (row[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}
