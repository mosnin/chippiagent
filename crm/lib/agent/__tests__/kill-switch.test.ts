/**
 * Unit tests for lib/agent/kill-switch.ts
 *
 * Default is run. The emergency stop is opt-in and off unless an active
 * DisabledSpace row exists. Fail-open on lookup errors so a down DB cannot
 * become a human-in-the-loop brake on normal Chippi runs.
 *
 * Tests cover:
 *  - Default path — no row → isSpaceDisabled false, assertSpaceEnabled resolves
 *  - Lookup error — fail open, autonomous execution continues
 *  - Thrown lookup — fail open, autonomous execution continues
 *  - Opt-in emergency stop — active row → isSpaceDisabled true, assert throws
 *  - Cache hit — DB called only once for repeated same-spaceId queries
 *  - Cache expiry — past-TTL second call re-queries DB
 *  - Errors are not cached — a later successful lookup is not stuck
 *
 * Mock strategy:
 *  - vi.mock('@/lib/supabase') using a per-test configurable responder so each
 *    test fully controls what the chainable Supabase client returns.
 *  - vi.spyOn(Date, 'now') for cache-expiry tests.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ── Supabase mock ─────────────────────────────────────────────────────────────
//
// We hoist the call-count and responder controls so the vi.mock factory can
// capture them before any module imports are resolved.

const { getMaybeSingleResponder, setMaybeSingleResponder } = vi.hoisted(() => {
  let responder: () => Promise<{ data: unknown; error: unknown }> = async () => ({
    data: null,
    error: null,
  });
  return {
    getMaybeSingleResponder: () => responder,
    setMaybeSingleResponder: (fn: typeof responder) => {
      responder = fn;
    },
  };
});

vi.mock('@/lib/supabase', () => {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'limit', 'is', 'not', 'order']) {
      chain[method] = vi.fn(() => chain);
    }
    chain.maybeSingle = vi.fn(() => {
      // Increment call counter each time maybeSingle is called
      // (that is when the DB is actually queried)
      const current = (globalThis as Record<string, unknown>).__killSwitchCallCount__ as number ?? 0;
      (globalThis as Record<string, unknown>).__killSwitchCallCount__ = current + 1;
      return getMaybeSingleResponder()();
    });
    return chain;
  }

  return {
    supabase: {
      from: vi.fn(() => makeChain()),
    },
  };
});

// Import AFTER mocks so kill-switch picks up the mocked supabase.
import { isSpaceDisabled, assertSpaceEnabled } from '../kill-switch';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns how many times the DB's maybeSingle was invoked since last reset. */
function dbCallCount(): number {
  return ((globalThis as Record<string, unknown>).__killSwitchCallCount__ as number) ?? 0;
}

function resetDbCallCount() {
  (globalThis as Record<string, unknown>).__killSwitchCallCount__ = 0;
}

// ── Setup ─────────────────────────────────────────────────────────────────────
//
// The kill-switch module maintains a module-level cache Map. We can't reset it
// between tests via imports, but we CAN use unique spaceIds per test to avoid
// cross-test cache contamination. Each test uses a unique spaceId string.

let testId = 0;
function uniqueSpaceId(): string {
  return `space_test_${++testId}_${Math.random().toString(36).slice(2)}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDbCallCount();
  // Default: space is not disabled — autonomous execution.
  setMaybeSingleResponder(async () => ({ data: null, error: null }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Default path: autonomous execution ────────────────────────────────────────

describe('default path is autonomous execution', () => {
  it('isSpaceDisabled returns false when no DisabledSpace row exists', async () => {
    const spaceId = uniqueSpaceId();
    await expect(isSpaceDisabled(spaceId)).resolves.toBe(false);
  });

  it('assertSpaceEnabled resolves — Chippi runs without a human enabling the space', async () => {
    const spaceId = uniqueSpaceId();
    await expect(assertSpaceEnabled(spaceId)).resolves.toBeUndefined();
  });

  it('a lookup error does not block execution (fail open)', async () => {
    setMaybeSingleResponder(async () => ({
      data: null,
      error: { message: 'connection refused' },
    }));
    const spaceId = uniqueSpaceId();

    await expect(isSpaceDisabled(spaceId)).resolves.toBe(false);
    await expect(assertSpaceEnabled(spaceId)).resolves.toBeUndefined();
  });

  it('a thrown lookup does not block execution (fail open)', async () => {
    setMaybeSingleResponder(async () => {
      throw new Error('network down');
    });
    const spaceId = uniqueSpaceId();

    await expect(isSpaceDisabled(spaceId)).resolves.toBe(false);
    await expect(assertSpaceEnabled(spaceId)).resolves.toBeUndefined();
  });

  it('lookup errors are not cached as a stop — a later success still runs', async () => {
    setMaybeSingleResponder(async () => ({
      data: null,
      error: { message: 'connection refused' },
    }));
    const spaceId = uniqueSpaceId();
    await expect(isSpaceDisabled(spaceId)).resolves.toBe(false);

    setMaybeSingleResponder(async () => ({ data: null, error: null }));
    await expect(assertSpaceEnabled(spaceId)).resolves.toBeUndefined();
  });
});

// ── Opt-in emergency stop (not the happy path) ────────────────────────────────

describe('opt-in emergency stop', () => {
  it('isSpaceDisabled returns true only when an active DisabledSpace row exists', async () => {
    setMaybeSingleResponder(async () => ({ data: { id: 'row_1' }, error: null }));
    const spaceId = uniqueSpaceId();
    await expect(isSpaceDisabled(spaceId)).resolves.toBe(true);
  });

  it('assertSpaceEnabled throws space_disabled:<id> only for that opt-in stop', async () => {
    setMaybeSingleResponder(async () => ({ data: { id: 'row_42' }, error: null }));
    const spaceId = uniqueSpaceId();
    await expect(assertSpaceEnabled(spaceId)).rejects.toThrow(`space_disabled:${spaceId}`);
  });

  it('thrown error message starts with "space_disabled:" and includes the spaceId', async () => {
    setMaybeSingleResponder(async () => ({ data: { id: 'row_1' }, error: null }));
    const spaceId = 'space_important_tenant_xyz';
    await expect(assertSpaceEnabled(spaceId)).rejects.toThrow(/^space_disabled:/);
    await expect(assertSpaceEnabled(spaceId)).rejects.toThrow(spaceId);
  });
});

// ── Cache (successful lookups only) ───────────────────────────────────────────

describe('isSpaceDisabled() cache', () => {
  it('queries the DB on first call for a spaceId', async () => {
    const spaceId = uniqueSpaceId();
    resetDbCallCount();
    await isSpaceDisabled(spaceId);
    expect(dbCallCount()).toBe(1);
  });

  it('serves the second call from cache — DB queried only once', async () => {
    const spaceId = uniqueSpaceId();
    resetDbCallCount();

    await isSpaceDisabled(spaceId);
    await isSpaceDisabled(spaceId);

    expect(dbCallCount()).toBe(1);
  });

  it('cached value matches the original DB result', async () => {
    setMaybeSingleResponder(async () => ({ data: { id: 'row_1' }, error: null }));
    const spaceId = uniqueSpaceId();

    const first = await isSpaceDisabled(spaceId);
    setMaybeSingleResponder(async () => ({ data: null, error: null }));
    const second = await isSpaceDisabled(spaceId);

    expect(first).toBe(true);
    expect(second).toBe(true);
  });

  it('re-queries the DB when the 30s TTL has elapsed', async () => {
    const spaceId = uniqueSpaceId();
    const realNow = Date.now();

    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(realNow);
    await isSpaceDisabled(spaceId);

    dateSpy.mockReturnValue(realNow + 31_000);
    resetDbCallCount();

    await isSpaceDisabled(spaceId);
    expect(dbCallCount()).toBe(1);
  });

  it('does NOT re-query when clock advance is under 30s', async () => {
    const spaceId = uniqueSpaceId();
    const realNow = Date.now();

    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(realNow);
    await isSpaceDisabled(spaceId);

    dateSpy.mockReturnValue(realNow + 15_000);
    resetDbCallCount();

    await isSpaceDisabled(spaceId);
    expect(dbCallCount()).toBe(0);
  });
});
