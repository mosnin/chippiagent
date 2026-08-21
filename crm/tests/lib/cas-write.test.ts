/**
 * CAS helpers — last-write-wins on tags/notes is the bug. These tests
 * prove a conflicting update retries from a fresh read and keeps the
 * other writer's fields.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

const queue: Array<{ data: Row | Row[] | null; error: unknown }> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const method of ['select', 'eq', 'is', 'in', 'update', 'insert']) {
      chain[method] = vi.fn(passthrough);
    }
    const term = () => {
      const next = queue.shift() ?? { data: null, error: null };
      return Promise.resolve(next);
    };
    chain.maybeSingle = vi.fn(term);
    chain.single = vi.fn(term);
    chain.then = (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
      term().then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn(() => makeChain()) } };
});

import { casUpdate, removeContactTags, retryOnConflict } from '@/lib/cas-write';

beforeEach(() => {
  queue.length = 0;
});

describe('casUpdate', () => {
  it('returns conflict when the match misses (0 rows)', async () => {
    queue.push({ data: null, error: null });
    const result = await casUpdate({
      table: 'Contact',
      id: 'c1',
      match: { updatedAt: '2026-01-01T00:00:00.000Z' },
      patch: { tags: ['assigned'] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('conflict');
  });

  it('returns the row when the match hits', async () => {
    queue.push({
      data: { id: 'c1', tags: ['assigned'], updatedAt: '2026-01-02T00:00:00.000Z' },
      error: null,
    });
    const result = await casUpdate({
      table: 'Contact',
      id: 'c1',
      match: { updatedAt: '2026-01-01T00:00:00.000Z' },
      patch: { tags: ['assigned'] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.row.id).toBe('c1');
  });
});

describe('removeContactTags', () => {
  it('retries after a stale tags write and keeps a concurrent assigned tag', async () => {
    // 1st read: page-load snapshot, no assigned yet
    queue.push({
      data: { id: 'c1', tags: ['new-lead', 'application-link'], updatedAt: 't0' },
      error: null,
    });
    // 1st write: CAS miss — assign-lead won the row
    queue.push({ data: null, error: null });
    // 2nd read: assigned is now on the row
    queue.push({
      data: { id: 'c1', tags: ['application-link', 'assigned'], updatedAt: 't1' },
      error: null,
    });
    // 2nd write: nothing to remove (new-lead already gone) — but build
    // sees no new-lead so skip. We still need the read only.
    const result = await removeContactTags({
      id: 'c1',
      spaceId: 's1',
      remove: ['new-lead'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skipped).toBe(true);
      expect(result.row.tags).toContain('assigned');
      expect(result.row.tags).not.toContain('new-lead');
    }
  });

  it('writes the filtered tags when the CAS hits on the first try', async () => {
    queue.push({
      data: { id: 'c1', tags: ['new-lead', 'hot'], updatedAt: 't0' },
      error: null,
    });
    queue.push({
      data: { id: 'c1', tags: ['hot'], updatedAt: 't1' },
      error: null,
    });
    const result = await removeContactTags({ id: 'c1', remove: ['new-lead'] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skipped).toBeUndefined();
      expect(result.row.tags).toEqual(['hot']);
    }
  });
});

describe('retryOnConflict', () => {
  it('aborts when build says the row is already claimed', async () => {
    queue.push({
      data: { id: 'c1', tags: ['assigned'], updatedAt: 't0' },
      error: null,
    });
    const result = await retryOnConflict<{ tags: string[]; updatedAt: string }>({
      table: 'Contact',
      id: 'c1',
      readColumns: 'id, tags, updatedAt',
      build: (current) =>
        current.tags.includes('assigned')
          ? { abort: 'conflict' }
          : { patch: { tags: [...current.tags, 'assigned'] } },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('conflict');
  });

  it('retries a notes prepend after a concurrent notes write', async () => {
    queue.push({
      data: { id: 'c1', notes: 'old', updatedAt: 't0' },
      error: null,
    });
    queue.push({ data: null, error: null }); // CAS miss
    queue.push({
      data: { id: 'c1', notes: 'broker note\n\nold', updatedAt: 't1' },
      error: null,
    });
    queue.push({
      data: {
        id: 'c1',
        notes: 'assigned line\n\nbroker note\n\nold',
        updatedAt: 't2',
      },
      error: null,
    });
    const result = await retryOnConflict<{ notes: string; updatedAt: string }>({
      table: 'Contact',
      id: 'c1',
      readColumns: 'id, notes, updatedAt',
      build: (current) => ({
        patch: {
          notes: `assigned line\n\n${current.notes}`,
          updatedAt: 't-next',
        },
        match: { updatedAt: current.updatedAt },
      }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.row.notes).toContain('broker note');
      expect(result.row.notes).toContain('assigned line');
    }
  });
});
