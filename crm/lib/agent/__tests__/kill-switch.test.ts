/**
 * Unit tests for lib/agent/kill-switch.ts
 *
 * Tests cover:
 *  - isSpaceDisabled() — space not disabled (null row) → false
 *  - isSpaceDisabled() — space disabled (row present) → true
 *  - Cache hit — DB called only once for repeated same-spaceId queries
 *  - Cache expiry — past-TTL second call re-queries DB
 *  - assertSpaceEnabled() — resolves without throwing when space is enabled
 *  - assertSpaceEnabled() — throws Error("space_disabled:<id>") when space is disabled
 *  - DB error — isSpaceDisabled() throws (the module propagates the error)
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

const { getMaybeSingleResponder, setMaybeSingleResponder, getCallCount, resetCallCount } =
  vi.hoisted(() => {
    let callCount = 0;
    // Default: space not disabled
    let responder: () => Promise<{ data: unknown; error: unknown }> = async () => ({
      data: null,
      error: null,
    });
    return {
      getMaybeSingleResponder: () => responder,
      setMaybeSingleResponder: (fn: typeof responder) => {
        responder = fn;
      },
      getCallCount: () => callCount,
      resetCallCount: () => {
        callCount = 0;
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
  // Default: space is not disabled
  setMaybeSingleResponder(async () => ({ data: null, error: null }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── isSpaceDisabled ───────────────────────────────────────────────────────────

describe('isSpaceDisabled()', () => {
  it('returns false when the DB returns null (space not in DisabledSpace table)', async () => {
    setMaybeSingleResponder(async () => ({ data: null, error: null }));
    const spaceId = uniqueSpaceId();
    const result = await isSpaceDisabled(spaceId);
    expect(result).toBe(false);
  });

  it('returns true when the DB returns a row (space is disabled)', async () => {
    setMaybeSingleResponder(async () => ({ data: { id: 'row_1' }, error: null }));
    const spaceId = uniqueSpaceId();
    const result = await isSpaceDisabled(spaceId);
    expect(result).toBe(true);
  });

  it('queries the DB on first call for a spaceId', async () => {
    setMaybeSingleResponder(async () => ({ data: null, error: null }));
    const spaceId = uniqueSpaceId();
    resetDbCallCount();
    await isSpaceDisabled(spaceId);
    expect(dbCallCount()).toBe(1);
  });

  describe('cache hit', () => {
    it('serves the second call from cache — DB queried only once', async () => {
      setMaybeSingleResponder(async () => ({ data: null, error: null }));
      const spaceId = uniqueSpaceId();
      resetDbCallCount();

      await isSpaceDisabled(spaceId);
      await isSpaceDisabled(spaceId); // should hit cache

      expect(dbCallCount()).toBe(1);
    });

    it('cached value matches the original DB result', async () => {
      setMaybeSingleResponder(async () => ({ data: { id: 'row_1' }, error: null }));
      const spaceId = uniqueSpaceId();

      const first = await isSpaceDisabled(spaceId);
      // Change the mock to return null — cache should still serve true
      setMaybeSingleResponder(async () => ({ data: null, error: null }));
      const second = await isSpaceDisabled(spaceId);

      expect(first).toBe(true);
      expect(second).toBe(true); // still from cache
    });
  });

  describe('cache expiry', () => {
    it('re-queries the DB when the 30s TTL has elapsed', async () => {
      const spaceId = uniqueSpaceId();
      const realNow = Date.now();

      // First call at t=0
      const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(realNow);
      setMaybeSingleResponder(async () => ({ data: null, error: null }));
      await isSpaceDisabled(spaceId);

      // Advance clock past 30s TTL
      dateSpy.mockReturnValue(realNow + 31_000);
      resetDbCallCount();

      // Second call should bypass expired cache and hit DB again
      await isSpaceDisabled(spaceId);
      expect(dbCallCount()).toBe(1);
    });

    it('does NOT re-query when clock advance is under 30s', async () => {
      const spaceId = uniqueSpaceId();
      const realNow = Date.now();

      const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(realNow);
      setMaybeSingleResponder(async () => ({ data: null, error: null }));
      await isSpaceDisabled(spaceId);

      // Advance only 15s — cache still valid
      dateSpy.mockReturnValue(realNow + 15_000);
      resetDbCallCount();

      await isSpaceDisabled(spaceId);
      expect(dbCallCount()).toBe(0); // served from cache
    });
  });

  describe('DB error', () => {
    it('throws when the DB returns an error (kill-switch propagates DB errors)', async () => {
      setMaybeSingleResponder(async () => ({
        data: null,
        error: { message: 'connection refused' },
      }));
      const spaceId = uniqueSpaceId();
      await expect(isSpaceDisabled(spaceId)).rejects.toThrow(
        'kill-switch: failed to query DisabledSpace: connection refused',
      );
    });
  });
});

// ── assertSpaceEnabled ────────────────────────────────────────────────────────

describe('assertSpaceEnabled()', () => {
  it('resolves without throwing when the space is enabled (not disabled)', async () => {
    setMaybeSingleResponder(async () => ({ data: null, error: null }));
    const spaceId = uniqueSpaceId();
    await expect(assertSpaceEnabled(spaceId)).resolves.toBeUndefined();
  });

  it('throws an Error with message starting "space_disabled:" when the space is disabled', async () => {
    setMaybeSingleResponder(async () => ({ data: { id: 'row_42' }, error: null }));
    const spaceId = uniqueSpaceId();
    await expect(assertSpaceEnabled(spaceId)).rejects.toThrow(
      `space_disabled:${spaceId}`,
    );
  });

  it('thrown error message starts with "space_disabled:"', async () => {
    setMaybeSingleResponder(async () => ({ data: { id: 'row_1' }, error: null }));
    const spaceId = uniqueSpaceId();
    let thrown: Error | null = null;
    try {
      await assertSpaceEnabled(spaceId);
    } catch (err) {
      thrown = err as Error;
    }
    expect(thrown).not.toBeNull();
    expect(thrown!.message).toMatch(/^space_disabled:/);
  });

  it('thrown error contains the spaceId', async () => {
    setMaybeSingleResponder(async () => ({ data: { id: 'row_1' }, error: null }));
    const spaceId = 'space_important_tenant_xyz';
    setMaybeSingleResponder(async () => ({ data: { id: 'row_1' }, error: null }));
    let thrown: Error | null = null;
    try {
      await assertSpaceEnabled(spaceId);
    } catch (err) {
      thrown = err as Error;
    }
    expect(thrown!.message).toContain(spaceId);
  });
});
