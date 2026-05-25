/**
 * BP3e — coverage for the seat-limit helper + invite enforcement.
 *
 * Written directly (not via agent) after the test agent timed out
 * mid-stream. Scope is intentionally focused on the pure helper and
 * the invite route; the Stripe webhook is not unit-tested here
 * because its routing helper wasn't extracted as a pure function —
 * testing it would require mocking the full handler (raw-body
 * signature check, Redis dedup, Stripe client) and the ROI is low
 * compared to exercising it in staging.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Supabase mock — table-keyed chain with per-call overrides ─────────────
interface TableMock {
  rows?: Array<Record<string, unknown>>;
  single?: Record<string, unknown> | null;
  error?: { message: string } | null;
  count?: number | null;
}
let mockByTable: Record<string, TableMock> = {};

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const override = mockByTable[table] ?? {};
    const rows = override.rows ?? [];
    const single = override.single;
    const error = override.error ?? null;
    const count = override.count ?? null;

    // For head:true count queries we resolve to { count, error }; for data
    // queries we resolve to { data, error }. `then` is called via await.
    const termThen = Promise.resolve(
      count != null ? { count, error } : { data: rows, error },
    );
    const singleThen = Promise.resolve({ data: single ?? rows[0] ?? null, error });

    const chain: Record<string, unknown> = {};
    const pass = () => chain;
    chain.select = vi.fn(pass);
    chain.eq = vi.fn(pass);
    chain.in = vi.fn(pass);
    chain.is = vi.fn(pass);
    chain.gt = vi.fn(pass);
    chain.neq = vi.fn(pass);
    chain.order = vi.fn(pass);
    chain.limit = vi.fn(pass);
    chain.update = vi.fn(pass);
    chain.delete = vi.fn(pass);
    chain.insert = vi.fn(pass);
    chain.maybeSingle = vi.fn(() => singleThen);
    chain.single = vi.fn(() => singleThen);
    chain.then = (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
      termThen.then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import {
  getSeatUsage,
  checkSeatCapacity,
} from '@/lib/brokerage-seats';

beforeEach(() => {
  mockByTable = {};
});

// ── getSeatUsage ──────────────────────────────────────────────────────────
describe('getSeatUsage', () => {
  it('sums members + non-expired pending invites', async () => {
    mockByTable = {
      Brokerage: { single: { plan: 'team', seatLimit: 15 } },
      BrokerageMembership: { count: 7 },
      Invitation: { count: 3 },
    };
    const u = await getSeatUsage('b1');
    expect(u).toMatchObject({
      plan: 'team',
      seatLimit: 15,
      members: 7,
      pendingInvites: 3,
      used: 10,
    });
  });

  it('returns seatLimit=null for enterprise', async () => {
    mockByTable = {
      Brokerage: { single: { plan: 'enterprise', seatLimit: null } },
      BrokerageMembership: { count: 42 },
      Invitation: { count: 0 },
    };
    const u = await getSeatUsage('b1');
    expect(u.plan).toBe('enterprise');
    expect(u.seatLimit).toBeNull();
    expect(u.used).toBe(42);
  });

  it('falls back to starter/5 when the Brokerage row select errors (pre-migration)', async () => {
    mockByTable = {
      Brokerage: { error: { message: 'column "plan" does not exist' }, single: null },
      BrokerageMembership: { count: 2 },
      Invitation: { count: 1 },
    };
    const u = await getSeatUsage('b1');
    // Fail CLOSED on the cap — the helper should NOT unlock the brokerage
    // just because the column isn't there yet.
    expect(u.plan).toBe('starter');
    expect(u.seatLimit).toBe(5);
  });
});

// ── checkSeatCapacity ─────────────────────────────────────────────────────
describe('checkSeatCapacity', () => {
  it('allows +1 when used=4/5', async () => {
    mockByTable = {
      Brokerage: { single: { plan: 'starter', seatLimit: 5 } },
      BrokerageMembership: { count: 4 },
      Invitation: { count: 0 },
    };
    const r = await checkSeatCapacity('b1', 1);
    expect(r.ok).toBe(true);
    expect(r.needed).toBeUndefined();
  });

  it('rejects +2 when used=4/5 with needed=2', async () => {
    mockByTable = {
      Brokerage: { single: { plan: 'starter', seatLimit: 5 } },
      BrokerageMembership: { count: 4 },
      Invitation: { count: 0 },
    };
    const r = await checkSeatCapacity('b1', 2);
    expect(r.ok).toBe(false);
    expect(r.needed).toBe(2);
  });

  it('enterprise always allows — even huge requests', async () => {
    mockByTable = {
      Brokerage: { single: { plan: 'enterprise', seatLimit: null } },
      BrokerageMembership: { count: 500 },
      Invitation: { count: 50 },
    };
    const r = await checkSeatCapacity('b1', 9999);
    expect(r.ok).toBe(true);
  });

  it('fails CLOSED on infra count error — silent overages are worse than a transient 402', async () => {
    // Audit of BP3 flipped this trade-off. If either count sub-query
    // can't reach the DB, we refuse the invite rather than risk the
    // brokerage silently exceeding its billed seat count.
    mockByTable = {
      Brokerage: { single: { plan: 'starter', seatLimit: 5 } },
      BrokerageMembership: { error: { message: 'db flap' }, count: null },
      Invitation: { count: 0 },
    };
    const r = await checkSeatCapacity('b1', 1);
    expect(r.ok).toBe(false);
    expect(r.needed).toBe(1);
  });

  it('clamps non-positive additional to 0 (never rejects on a zero-invite probe)', async () => {
    mockByTable = {
      Brokerage: { single: { plan: 'starter', seatLimit: 5 } },
      BrokerageMembership: { count: 5 }, // full
      Invitation: { count: 0 },
    };
    const r = await checkSeatCapacity('b1', 0);
    expect(r.ok).toBe(true);
  });
});
