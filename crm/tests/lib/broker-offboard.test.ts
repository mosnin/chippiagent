import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Brokerage, BrokerageMembership } from '@/lib/types';

// ── Supabase mock ─────────────────────────────────────────────────────────
// The offboard route makes multiple chained queries against the same
// `BrokerageMembership` table (target, then destination), so we let each table
// carry a FIFO queue of "next result" entries. `.maybeSingle()` consumes the
// front of the queue for single-row lookups; the thenable chain drains the
// queue for `.in()`-style array lookups.

type SingleResult = { data: Record<string, unknown> | null; error: { message: string } | null };
type RowsResult = { data: Array<Record<string, unknown>>; error: { message: string } | null };

interface TableState {
  singles: SingleResult[];
  rows: RowsResult[];
}

const tableState: Record<string, TableState> = {};

function queueSingle(table: string, data: Record<string, unknown> | null, error: { message: string } | null = null): void {
  if (!tableState[table]) tableState[table] = { singles: [], rows: [] };
  tableState[table].singles.push({ data, error });
}

function queueRows(table: string, data: Array<Record<string, unknown>>, error: { message: string } | null = null): void {
  if (!tableState[table]) tableState[table] = { singles: [], rows: [] };
  tableState[table].rows.push({ data, error });
}

// rpc queue
type RpcResult = { data: unknown; error: { message: string } | null };
const rpcQueue: RpcResult[] = [];
function queueRpc(data: unknown, error: { message: string } | null = null): void {
  rpcQueue.push({ data, error });
}

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async (_name: string, _args: Record<string, unknown>) => {
    const next = rpcQueue.shift();
    if (!next) return { data: null, error: null };
    return next;
  }),
}));

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const getNextSingle = (): SingleResult => {
      const state = tableState[table];
      const entry = state?.singles.shift();
      return entry ?? { data: null, error: null };
    };
    const getNextRows = (): RowsResult => {
      const state = tableState[table];
      const entry = state?.rows.shift();
      return entry ?? { data: [], error: null };
    };

    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      is: vi.fn(() => chain),
      insert: vi.fn(() => {
        // Used only by audit — return a no-op thenable.
        const p = Promise.resolve({ data: null, error: null });
        return {
          ...chain,
          then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) => p.then(r, e),
        };
      }),
      maybeSingle: vi.fn(() => Promise.resolve(getNextSingle())),
      // Thenable at the end of a chain that didn't go through maybeSingle — e.g. `.in()`.
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
let requireBrokerImpl: () => Promise<{ brokerage: Brokerage; membership: BrokerageMembership; dbUserId: string }>;

vi.mock('@/lib/permissions', () => ({
  requireBroker: vi.fn(() => requireBrokerImpl()),
}));

// ── audit + clerk + logger ─────────────────────────────────────────────────
const { auditMock } = vi.hoisted(() => ({ auditMock: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit', () => ({ audit: auditMock }));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'clerk_caller' })),
}));

// Silence logger.error so failing-rpc tests don't pollute output.
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Route under test ───────────────────────────────────────────────────────
import { POST } from '@/app/api/broker/members/[id]/offboard/route';

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

function setCaller(role: 'broker_owner' | 'broker_admin' | 'realtor_member' = 'broker_owner', dbUserId = 'u_caller'): void {
  requireBrokerImpl = async () => ({
    brokerage: makeBrokerage(),
    membership: makeMembership({ role, userId: dbUserId }),
    dbUserId,
  });
}

interface PostBody {
  destinationMembershipId?: string;
  dryRun?: boolean;
}

function buildRequest(id: string, body: PostBody | string | undefined): Request {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return new Request(`http://localhost/api/broker/members/${id}/offboard`, init);
}

async function invoke(id: string, body: PostBody | string | undefined): Promise<{ status: number; json: Record<string, unknown> }> {
  const req = buildRequest(id, body);
  // The route is typed as NextRequest; Request is structurally compatible at runtime.
  // Cast through unknown to avoid leaking `any`.
  const res = await POST(
    req as unknown as Parameters<typeof POST>[0],
    { params: Promise.resolve({ id }) },
  );
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

beforeEach(() => {
  for (const key of Object.keys(tableState)) delete tableState[key];
  rpcQueue.length = 0;
  rpcMock.mockClear();
  auditMock.mockClear();
  setCaller('broker_owner');
});

// ── Tests ───────────────────────────────────────────────────────────────────
describe('POST /api/broker/members/[id]/offboard', () => {
  describe('authorization', () => {
    it('returns 403 when the caller is not a broker at all', async () => {
      requireBrokerImpl = async () => {
        throw new Error('Forbidden: broker access required');
      };
      const { status, json } = await invoke('mem_target', { destinationMembershipId: 'mem_dest' });
      expect(status).toBe(403);
      expect(json).toEqual({ error: 'Forbidden' });
    });

    it('returns 403 when the caller is broker_admin (not owner)', async () => {
      setCaller('broker_admin');
      const { status, json } = await invoke('mem_target', { destinationMembershipId: 'mem_dest' });
      expect(status).toBe(403);
      expect(json.error).toMatch(/owner/i);
    });
  });

  describe('validation', () => {
    it('returns 400 when destinationMembershipId is missing', async () => {
      const { status, json } = await invoke('mem_target', {});
      expect(status).toBe(400);
      expect(json.error).toMatch(/destinationMembershipId/);
    });

    it('returns 400 when destinationMembershipId is an empty string', async () => {
      const { status } = await invoke('mem_target', { destinationMembershipId: '' });
      expect(status).toBe(400);
    });

    it('returns 400 when body is invalid JSON', async () => {
      const { status, json } = await invoke('mem_target', '{not json');
      expect(status).toBe(400);
      expect(json.error).toMatch(/JSON/i);
    });

    it('returns 400 when destination === target', async () => {
      // Target lookup + destination lookup both return the same membership row.
      queueSingle('BrokerageMembership', {
        id: 'mem_same',
        userId: 'u_leaving',
        role: 'realtor_member',
      });
      queueSingle('BrokerageMembership', {
        id: 'mem_same',
        userId: 'u_leaving',
        role: 'realtor_member',
      });
      const { status, json } = await invoke('mem_same', { destinationMembershipId: 'mem_same' });
      expect(status).toBe(400);
      expect(json.error).toMatch(/different/i);
    });
  });

  describe('lookups', () => {
    it('returns 404 when the target membership is not in this brokerage', async () => {
      queueSingle('BrokerageMembership', null); // target not found
      const { status, json } = await invoke('mem_ghost', { destinationMembershipId: 'mem_dest' });
      expect(status).toBe(404);
      expect(json).toEqual({ error: 'Member not found' });
    });

    it('returns 404 when the destination membership is not found', async () => {
      queueSingle('BrokerageMembership', {
        id: 'mem_target',
        userId: 'u_leaving',
        role: 'realtor_member',
      });
      queueSingle('BrokerageMembership', null); // destination missing
      const { status, json } = await invoke('mem_target', { destinationMembershipId: 'mem_missing' });
      expect(status).toBe(404);
      expect(json).toEqual({ error: 'Destination not found' });
    });

    it('returns 403 when the target is the broker_owner', async () => {
      queueSingle('BrokerageMembership', {
        id: 'mem_target',
        userId: 'u_owner',
        role: 'broker_owner',
      });
      queueSingle('BrokerageMembership', {
        id: 'mem_dest',
        userId: 'u_dest',
        role: 'broker_admin',
      });
      const { status, json } = await invoke('mem_target', { destinationMembershipId: 'mem_dest' });
      expect(status).toBe(403);
      expect(json.error).toMatch(/owner/i);
    });

    it('returns 400 when the caller tries to offboard themselves', async () => {
      // Caller is u_caller; the target membership also points at u_caller.
      queueSingle('BrokerageMembership', {
        id: 'mem_self',
        userId: 'u_caller',
        role: 'realtor_member',
      });
      queueSingle('BrokerageMembership', {
        id: 'mem_dest',
        userId: 'u_dest',
        role: 'broker_admin',
      });
      const { status, json } = await invoke('mem_self', { destinationMembershipId: 'mem_dest' });
      expect(status).toBe(400);
      expect(json.error).toMatch(/yourself/i);
    });

    it('returns 409 when the destination user is not active', async () => {
      queueSingle('BrokerageMembership', {
        id: 'mem_target',
        userId: 'u_leaving',
        role: 'realtor_member',
      });
      queueSingle('BrokerageMembership', {
        id: 'mem_dest',
        userId: 'u_dest',
        role: 'realtor_member',
      });
      queueRows('User', [
        { id: 'u_leaving', name: 'Leaving Person', email: 'leave@x.com', status: 'active' },
        { id: 'u_dest', name: 'Dest Person', email: 'dest@x.com', status: 'offboarded' },
      ]);
      const { status, json } = await invoke('mem_target', { destinationMembershipId: 'mem_dest' });
      expect(status).toBe(409);
      expect(json.error).toMatch(/active/i);
    });
  });

  describe('happy paths', () => {
    function seedHappyPathLookups(): void {
      queueSingle('BrokerageMembership', {
        id: 'mem_target',
        userId: 'u_leaving',
        role: 'realtor_member',
      });
      queueSingle('BrokerageMembership', {
        id: 'mem_dest',
        userId: 'u_dest',
        role: 'broker_admin',
      });
      queueRows('User', [
        { id: 'u_leaving', name: 'Leaving Person', email: 'leave@x.com', status: 'active' },
        { id: 'u_dest', name: 'Dest Person', email: 'dest@x.com', status: 'active' },
      ]);
    }

    it('dry-run returns counts plus leaving/destination names', async () => {
      seedHappyPathLookups();
      queueRpc({
        dryRun: true,
        contact_count: 5,
        deal_count: 2,
        open_tour_count: 1,
      });

      const { status, json } = await invoke('mem_target', {
        destinationMembershipId: 'mem_dest',
        dryRun: true,
      });

      expect(status).toBe(200);
      expect(json.dryRun).toBe(true);
      expect(json.contactCount).toBe(5);
      expect(json.dealCount).toBe(2);
      expect(json.openTourCount).toBe(1);
      expect(json.leavingUserName).toBe('Leaving Person');
      expect(json.destinationUserName).toBe('Dest Person');

      // Audit should NOT fire on dry-run.
      expect(auditMock).not.toHaveBeenCalled();

      // Verify the rpc call shape.
      expect(rpcMock).toHaveBeenCalledTimes(1);
      expect((rpcMock.mock.calls as unknown[][])[0][0]).toBe('offboard_brokerage_member');
      expect((rpcMock.mock.calls as unknown[][])[0][1]).toMatchObject({
        p_leaving_user_id: 'u_leaving',
        p_destination_user_id: 'u_dest',
        p_brokerage_id: 'brk_1',
        p_dry_run: true,
      });
    });

    it('real-run returns moved counts and fires an OFFBOARD audit event', async () => {
      seedHappyPathLookups();
      queueRpc({
        dryRun: false,
        contacts_moved: 5,
        deals_moved: 2,
        tours_moved: 1,
      });

      const { status, json } = await invoke('mem_target', {
        destinationMembershipId: 'mem_dest',
      });

      expect(status).toBe(200);
      expect(json.dryRun).toBe(false);
      expect(json.contactsMoved).toBe(5);
      expect(json.dealsMoved).toBe(2);
      expect(json.toursMoved).toBe(1);

      // Audit is fire-and-forget; it's called synchronously before the
      // response resolves.
      expect(auditMock).toHaveBeenCalledTimes(1);
      const auditArgs = (auditMock.mock.calls as unknown[][])[0][0] as {
        action: string;
        resource: string;
        resourceId: string;
        actorClerkId: string | null;
      };
      expect(auditArgs.action).toBe('OFFBOARD');
      expect(auditArgs.resource).toBe('BrokerageMembership');
      expect(auditArgs.resourceId).toBe('mem_target');
      expect(auditArgs.actorClerkId).toBe('clerk_caller');

      expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_dry_run: false });
    });
  });

  describe('failures', () => {
    it('returns 500 when the rpc returns an error', async () => {
      queueSingle('BrokerageMembership', {
        id: 'mem_target',
        userId: 'u_leaving',
        role: 'realtor_member',
      });
      queueSingle('BrokerageMembership', {
        id: 'mem_dest',
        userId: 'u_dest',
        role: 'broker_admin',
      });
      queueRows('User', [
        { id: 'u_leaving', name: 'Leaving Person', email: 'leave@x.com', status: 'active' },
        { id: 'u_dest', name: 'Dest Person', email: 'dest@x.com', status: 'active' },
      ]);
      queueRpc(null, { message: 'bang' });

      const { status, json } = await invoke('mem_target', { destinationMembershipId: 'mem_dest' });
      expect(status).toBe(500);
      expect(json).toEqual({ error: 'Transfer failed' });
      expect(auditMock).not.toHaveBeenCalled();
    });
  });
});
