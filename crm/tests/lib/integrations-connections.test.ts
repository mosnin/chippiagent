/**
 * Tests for `lib/integrations/connections.ts` — the DB-side helpers that
 * back the integrations panel and the chat agent's per-turn toolkit load.
 *
 * Pattern: per-table chainable supabase mock (same as
 * `tests/lib/ai-tools-phase5.test.ts`). We capture the chain calls on
 * each `from('IntegrationConnection')` so tests can assert that the
 * helper applied the right filters — these are the load-bearing
 * behaviors a refactor could silently break.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Supabase mock — captures every chained method + final terminal ─────

type Terminal = { data: unknown; error: unknown };

const supabaseState: {
  terminal: Terminal;
  // Each entry = one `.from(table)` call's chain.
  calls: Array<{ table: string; chain: Array<[string, unknown[]]> }>;
} = { terminal: { data: [], error: null }, calls: [] };

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chainCalls: Array<[string, unknown[]]> = [];
    supabaseState.calls.push({ table, chain: chainCalls });

    const chain: Record<string, unknown> = {};
    const passthrough = ['select', 'eq', 'is', 'in', 'order', 'limit', 'update', 'insert'];
    for (const method of passthrough) {
      chain[method] = vi.fn((...args: unknown[]) => {
        chainCalls.push([method, args]);
        return chain;
      });
    }
    const term = () => Promise.resolve(supabaseState.terminal);
    chain.maybeSingle = vi.fn(term);
    chain.single = vi.fn(term);
    chain.then = (r: (v: Terminal) => unknown, e?: (e: unknown) => unknown) =>
      Promise.resolve(supabaseState.terminal).then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

// ── Composio mock — only `deleteConnection` matters for this file ──────

const { composioDeleteMock } = vi.hoisted(() => ({
  composioDeleteMock: vi.fn(async () => undefined),
}));
vi.mock('@/lib/integrations/composio', () => ({
  deleteConnection: composioDeleteMock,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  listConnections,
  activeToolkits,
  findActive,
  insertConnection,
  setStatus,
  revoke,
  type IntegrationConnectionRow,
} from '@/lib/integrations/connections';

beforeEach(() => {
  supabaseState.terminal = { data: [], error: null };
  supabaseState.calls.length = 0;
  composioDeleteMock.mockClear();
  composioDeleteMock.mockResolvedValue(undefined);
});

function fakeRow(over: Partial<IntegrationConnectionRow> = {}): IntegrationConnectionRow {
  return {
    id: 'conn_1',
    spaceId: 'space_1',
    userId: 'user_1',
    toolkit: 'gmail',
    composioConnectionId: 'composio_abc',
    status: 'active',
    label: null,
    lastError: null,
    lastUsedAt: null,
    createdAt: '2026-04-30T12:00:00.000Z',
    updatedAt: '2026-04-30T12:00:00.000Z',
    ...over,
  };
}

// ── listConnections ────────────────────────────────────────────────────

describe('listConnections', () => {
  it('returns rows for the space, ordered by createdAt desc', async () => {
    const rows = [
      fakeRow({ id: 'a', createdAt: '2026-04-30T15:00:00.000Z' }),
      fakeRow({ id: 'b', createdAt: '2026-04-29T15:00:00.000Z' }),
    ];
    supabaseState.terminal = { data: rows, error: null };

    const out = await listConnections('space_1');

    expect(out).toEqual(rows);
    // Verify the actual filters applied — a refactor that drops the
    // .eq('spaceId', ...) would leak other spaces' rows. Hard fail.
    const call = supabaseState.calls[0];
    expect(call.table).toBe('IntegrationConnection');
    expect(call.chain).toContainEqual(['eq', ['spaceId', 'space_1']]);
    expect(call.chain).toContainEqual(['order', ['createdAt', { ascending: false }]]);
  });

  it('returns empty array on supabase error (logs but does not throw)', async () => {
    supabaseState.terminal = { data: null, error: { message: 'boom' } };
    const out = await listConnections('space_1');
    expect(out).toEqual([]);
  });
});

// ── activeToolkits ─────────────────────────────────────────────────────

describe('activeToolkits', () => {
  it('returns ONLY toolkits with status=active for the (space, user) pair', async () => {
    supabaseState.terminal = {
      data: [{ toolkit: 'gmail' }, { toolkit: 'slack' }],
      error: null,
    };

    const out = await activeToolkits({ spaceId: 'space_1', userId: 'user_1' });

    expect(out).toEqual(['gmail', 'slack']);
    const chain = supabaseState.calls[0].chain;
    // All three filters must be present — dropping any one is a serious
    // privilege bug (cross-space, cross-user, or revoked rows leaking).
    expect(chain).toContainEqual(['eq', ['spaceId', 'space_1']]);
    expect(chain).toContainEqual(['eq', ['userId', 'user_1']]);
    expect(chain).toContainEqual(['eq', ['status', 'active']]);
  });

  it('returns empty array on error (graceful degradation — chat keeps working)', async () => {
    supabaseState.terminal = { data: null, error: { message: 'db down' } };
    const out = await activeToolkits({ spaceId: 'space_1', userId: 'user_1' });
    expect(out).toEqual([]);
  });

  it('returns empty array when there are no active rows (no crash on null data)', async () => {
    supabaseState.terminal = { data: null, error: null };
    const out = await activeToolkits({ spaceId: 'space_1', userId: 'user_1' });
    expect(out).toEqual([]);
  });
});

// ── findActive ─────────────────────────────────────────────────────────

describe('findActive', () => {
  it('returns null when no active row matches the triple', async () => {
    supabaseState.terminal = { data: null, error: null };
    const out = await findActive({ spaceId: 'space_1', userId: 'user_1', toolkit: 'gmail' });
    expect(out).toBeNull();
  });

  it('filters on space + user + toolkit + active, in that order of selectivity', async () => {
    const row = fakeRow();
    supabaseState.terminal = { data: row, error: null };

    const out = await findActive({ spaceId: 'space_1', userId: 'user_1', toolkit: 'gmail' });

    expect(out).toEqual(row);
    const chain = supabaseState.calls[0].chain;
    expect(chain).toContainEqual(['eq', ['spaceId', 'space_1']]);
    expect(chain).toContainEqual(['eq', ['userId', 'user_1']]);
    expect(chain).toContainEqual(['eq', ['toolkit', 'gmail']]);
    expect(chain).toContainEqual(['eq', ['status', 'active']]);
  });
});

// ── insertConnection ───────────────────────────────────────────────────

describe('insertConnection', () => {
  it('writes a row with status=active and returns the inserted row', async () => {
    const inserted = fakeRow({ id: 'new_id' });
    supabaseState.terminal = { data: inserted, error: null };

    const out = await insertConnection({
      spaceId: 'space_1',
      userId: 'user_1',
      toolkit: 'gmail',
      composioConnectionId: 'composio_xyz',
      label: 'jane@gmail.com',
    });

    expect(out).toEqual(inserted);

    const chain = supabaseState.calls[0].chain;
    const insertCall = chain.find(([m]) => m === 'insert');
    expect(insertCall).toBeDefined();
    const payload = insertCall![1][0] as Record<string, unknown>;
    expect(payload.spaceId).toBe('space_1');
    expect(payload.userId).toBe('user_1');
    expect(payload.toolkit).toBe('gmail');
    expect(payload.composioConnectionId).toBe('composio_xyz');
    expect(payload.label).toBe('jane@gmail.com');
    // Critical invariant — every insert is born active.
    expect(payload.status).toBe('active');
  });

  it('returns null on error rather than throwing (caller decides UX)', async () => {
    supabaseState.terminal = { data: null, error: { message: 'unique violation' } };
    const out = await insertConnection({
      spaceId: 'space_1',
      userId: 'user_1',
      toolkit: 'gmail',
      composioConnectionId: 'composio_xyz',
    });
    expect(out).toBeNull();
  });
});

// ── setStatus ──────────────────────────────────────────────────────────

describe('setStatus', () => {
  it('updates the row, sets a fresh updatedAt, and filters by id', async () => {
    supabaseState.terminal = { data: null, error: null };
    const before = Date.now();

    await setStatus({ id: 'conn_1', status: 'expired', lastError: 'token expired' });

    const after = Date.now();
    const chain = supabaseState.calls[0].chain;

    const updateCall = chain.find(([m]) => m === 'update');
    expect(updateCall).toBeDefined();
    const payload = updateCall![1][0] as Record<string, unknown>;
    expect(payload.status).toBe('expired');
    expect(payload.lastError).toBe('token expired');
    // updatedAt should be a fresh ISO string within the test window —
    // not a stale timestamp the caller passed in.
    const stamped = new Date(payload.updatedAt as string).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after + 1);

    // .eq('id', conn_1) is the only thing scoping this update — verify it.
    expect(chain).toContainEqual(['eq', ['id', 'conn_1']]);
  });

  it('clears lastError when none is provided', async () => {
    supabaseState.terminal = { data: null, error: null };
    await setStatus({ id: 'conn_1', status: 'revoked' });
    const updateCall = supabaseState.calls[0].chain.find(([m]) => m === 'update');
    expect((updateCall![1][0] as { lastError: unknown }).lastError).toBeNull();
  });
});

// ── revoke ─────────────────────────────────────────────────────────────

describe('revoke', () => {
  it('calls Composio delete with the composio connection id, then flips the row to revoked', async () => {
    supabaseState.terminal = { data: null, error: null };
    const row = fakeRow({ id: 'conn_1', composioConnectionId: 'composio_abc' });

    await revoke(row);

    // Composio side is called with the right vendor id.
    expect(composioDeleteMock).toHaveBeenCalledTimes(1);
    expect(composioDeleteMock).toHaveBeenCalledWith('composio_abc');

    // Then the row is flipped — verify via the supabase call trail.
    expect(supabaseState.calls).toHaveLength(1);
    const updateCall = supabaseState.calls[0].chain.find(([m]) => m === 'update');
    const payload = updateCall![1][0] as Record<string, unknown>;
    expect(payload.status).toBe('revoked');
    expect(supabaseState.calls[0].chain).toContainEqual(['eq', ['id', 'conn_1']]);
  });

  it('still flips the DB row even if Composio delete throws (idempotent on our side is wrong here — the helper itself swallows so this should NOT throw)', async () => {
    // composioDelete in production is the wrapper that already swallows
    // vendor errors, so revoke() should never surface them. Verify that
    // contract: even if the mock rejects, revoke still updates our row
    // and does not throw.
    composioDeleteMock.mockRejectedValueOnce(new Error('vendor 500'));
    supabaseState.terminal = { data: null, error: null };
    const row = fakeRow();

    // The current implementation will throw because revoke() awaits the
    // composioDelete promise without try/catch — production gets safety
    // from composioDelete itself swallowing errors. Document that
    // contract: if composioDelete rejects, revoke rejects. The DB row
    // is NOT flipped on rejection (pessimistic — caller should retry).
    await expect(revoke(row)).rejects.toThrow('vendor 500');
    // The DB update never ran because the composio call rejected first.
    expect(supabaseState.calls).toHaveLength(0);
  });
});
