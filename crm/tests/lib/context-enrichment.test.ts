/**
 * Phase 13 — context-enrichment helper tests.
 *
 * The helper queries four tables (Deal, DealStage, Contact, ContactActivity).
 * The mock routes each `from(table)` call to a per-table fixture so we can
 * stage a deal, its stage, the contact, and the contact's recent activities
 * independently and assert the shape of the EnrichedContext we get back.
 *
 * No network. No real DB. Just the data shape contract: dates formatted
 * YYYY-MM-DD, content trimmed to 80 chars, newest activity first, and
 * daysSinceLastTouch null when the timestamp is missing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Per-table fixtures ─────────────────────────────────────────────────────
// One slot per table. Each test sets just what it needs; beforeEach resets.

interface ChainResult {
  data: unknown;
  error: { message: string } | null;
}

interface TableFixture {
  // Result for `.maybeSingle()` — used by Deal/DealStage/Contact lookups.
  single?: ChainResult;
  // Result for awaiting the chain directly — used by ContactActivity (list).
  list?: ChainResult;
}

let fixtures: Record<string, TableFixture> = {};

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string) {
    const fx = (): TableFixture => fixtures[table] ?? {};
    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(() =>
        Promise.resolve(fx().single ?? { data: null, error: null }),
      ),
      // The list-flavored chain is `await`ed directly — make it a thenable.
      then: (resolve: (v: ChainResult) => void) =>
        resolve(fx().list ?? { data: [], error: null }),
    };
    return chain;
  }
  return {
    supabase: { from: vi.fn((table: string) => makeChain(table)) },
  };
});

import {
  enrichContext,
  renderEnrichedContext,
  renderEnrichedContextBlock,
  __resetEnrichContextCacheForTests,
} from '@/lib/ai-tools/context-enrichment';
import { supabase } from '@/lib/supabase';

beforeEach(() => {
  fixtures = {};
  __resetEnrichContextCacheForTests();
  vi.clearAllMocks();
});

// ── Helpers ────────────────────────────────────────────────────────────────

function setDeal(deal: Record<string, unknown> | null) {
  fixtures.Deal = { single: { data: deal, error: null } };
}
function setStage(stage: Record<string, unknown> | null) {
  fixtures.DealStage = { single: { data: stage, error: null } };
}
function setContact(contact: Record<string, unknown> | null) {
  fixtures.Contact = { single: { data: contact, error: null } };
}
function setActivities(rows: Array<Record<string, unknown>>) {
  fixtures.ContactActivity = { list: { data: rows, error: null } };
}

const NOW = new Date('2026-05-01T12:00:00Z');

// ── Tests ──────────────────────────────────────────────────────────────────

describe('enrichContext — deal subject', () => {
  it('returns label, stage, status, days-quiet and 3 activities', async () => {
    setDeal({
      id: 'deal_1',
      title: 'Chen — 7th Ave',
      contactId: 'c_1',
      status: 'active',
      stageId: 'stage_app',
      updatedAt: '2026-04-29T12:00:00Z',
    });
    setStage({ name: 'Application' });
    setActivities([
      { type: 'email', content: 'tour confirmation', createdAt: '2026-04-29T15:00:00Z' },
      { type: 'note', content: 'budget moved to $750k', createdAt: '2026-04-25T10:00:00Z' },
      { type: 'call', content: 'left voicemail', createdAt: '2026-04-20T09:00:00Z' },
    ]);

    const ctx = await enrichContext({ kind: 'deal', id: 'deal_1' }, 'space_1', { now: NOW });

    expect(ctx).not.toBeNull();
    expect(ctx!.subjectLabel).toBe('Chen — 7th Ave');
    expect(ctx!.stage).toBe('Application');
    expect(ctx!.status).toBe('active');
    expect(ctx!.daysSinceLastTouch).toBe(2); // Apr 29 → May 1
    expect(ctx!.lastActivities).toHaveLength(3);
    expect(ctx!.lastActivities[0]).toBe('2026-04-29 — email: tour confirmation');
    expect(ctx!.lastActivities[1]).toBe('2026-04-25 — note: budget moved to $750k');
  });

  it('returns null when the deal does not exist', async () => {
    setDeal(null);
    const ctx = await enrichContext({ kind: 'deal', id: 'missing' }, 'space_1', { now: NOW });
    expect(ctx).toBeNull();
  });

  it('handles a deal with no contactId — no activities, no crash', async () => {
    setDeal({
      id: 'deal_2',
      title: 'Orphan deal',
      contactId: null,
      status: 'active',
      stageId: null,
      updatedAt: '2026-04-30T00:00:00Z',
    });
    const ctx = await enrichContext({ kind: 'deal', id: 'deal_2' }, 'space_1', { now: NOW });
    expect(ctx).not.toBeNull();
    expect(ctx!.lastActivities).toEqual([]);
    expect(ctx!.stage).toBeUndefined();
  });
});

describe('enrichContext — person subject', () => {
  it('returns score, label, and zero activities cleanly', async () => {
    setContact({
      id: 'c_42',
      name: 'Maya Chen',
      scoreLabel: 'hot',
      leadScore: 88,
      lastContactedAt: '2026-04-28T08:00:00Z',
    });
    setActivities([]);

    const ctx = await enrichContext({ kind: 'person', id: 'c_42' }, 'space_1', { now: NOW });

    expect(ctx).not.toBeNull();
    expect(ctx!.subjectLabel).toBe('Maya Chen');
    expect(ctx!.scoreLabel).toBe('hot');
    expect(ctx!.leadScore).toBe(88);
    expect(ctx!.lastActivities).toEqual([]);
    expect(ctx!.daysSinceLastTouch).toBe(3);
  });

  it('returns null when the contact does not exist', async () => {
    setContact(null);
    const ctx = await enrichContext({ kind: 'person', id: 'nope' }, 'space_1', { now: NOW });
    expect(ctx).toBeNull();
  });

  it('daysSinceLastTouch is null when lastContactedAt is null', async () => {
    setContact({
      id: 'c_1',
      name: 'No-touch Nick',
      scoreLabel: null,
      leadScore: null,
      lastContactedAt: null,
    });
    setActivities([]);
    const ctx = await enrichContext({ kind: 'person', id: 'c_1' }, 'space_1', { now: NOW });
    expect(ctx!.daysSinceLastTouch).toBeNull();
  });

  it('truncates activity content to 80 chars with an ellipsis', async () => {
    setContact({
      id: 'c_2',
      name: 'Verbose Vera',
      scoreLabel: 'warm',
      leadScore: 60,
      lastContactedAt: '2026-04-30T00:00:00Z',
    });
    const longContent = 'a'.repeat(200);
    setActivities([
      { type: 'note', content: longContent, createdAt: '2026-04-30T10:00:00Z' },
    ]);
    const ctx = await enrichContext({ kind: 'person', id: 'c_2' }, 'space_1', { now: NOW });
    const line = ctx!.lastActivities[0];
    // "YYYY-MM-DD — note: " is 19 chars, then up to 80 chars of content.
    // We assert the content portion is bounded — full line ≤ ~99 chars and ends in ellipsis.
    expect(line.length).toBeLessThanOrEqual(100);
    expect(line.endsWith('…')).toBe(true);
  });

  it('preserves the order it gets from supabase (newest first by query)', async () => {
    setContact({
      id: 'c_3',
      name: 'Ordered Olivia',
      scoreLabel: null,
      leadScore: null,
      lastContactedAt: '2026-04-30T00:00:00Z',
    });
    setActivities([
      { type: 'email', content: 'newest', createdAt: '2026-04-30T10:00:00Z' },
      { type: 'note', content: 'middle', createdAt: '2026-04-25T10:00:00Z' },
      { type: 'call', content: 'oldest', createdAt: '2026-04-10T10:00:00Z' },
    ]);
    const ctx = await enrichContext({ kind: 'person', id: 'c_3' }, 'space_1', { now: NOW });
    expect(ctx!.lastActivities[0]).toContain('newest');
    expect(ctx!.lastActivities[1]).toContain('middle');
    expect(ctx!.lastActivities[2]).toContain('oldest');
  });

  it('renders activity without trailing colon when content is empty', async () => {
    setContact({
      id: 'c_4',
      name: 'Quiet Quinn',
      scoreLabel: null,
      leadScore: null,
      lastContactedAt: null,
    });
    setActivities([
      { type: 'system', content: null, createdAt: '2026-04-29T10:00:00Z' },
    ]);
    const ctx = await enrichContext({ kind: 'person', id: 'c_4' }, 'space_1', { now: NOW });
    expect(ctx!.lastActivities[0]).toBe('2026-04-29 — system');
  });
});

describe('enrichContext — cache', () => {
  // The cache lives in lib/ai-tools/context-enrichment.ts. TTL is 5 minutes.
  // We can't fast-forward the cache's internal Date.now() (it intentionally
  // ignores opts.now for eviction) without mocking the global clock, which
  // is what these tests do. Each test resets via the public helper.

  function setMayaFixtures() {
    setContact({
      id: 'c_42',
      name: 'Maya Chen',
      scoreLabel: 'hot',
      leadScore: 88,
      lastContactedAt: '2026-04-28T08:00:00Z',
    });
    setActivities([]);
  }

  it('serves the second call from cache (no second supabase round-trip)', async () => {
    setMayaFixtures();
    const fromSpy = supabase.from as unknown as ReturnType<typeof vi.fn>;

    const a = await enrichContext({ kind: 'person', id: 'c_42' }, 'space_1', { now: NOW });
    const callsAfterFirst = fromSpy.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const b = await enrichContext({ kind: 'person', id: 'c_42' }, 'space_1', { now: NOW });
    expect(fromSpy.mock.calls.length).toBe(callsAfterFirst);
    expect(b).toEqual(a);
  });

  it('re-queries after the 5-minute TTL elapses', async () => {
    setMayaFixtures();
    const fromSpy = supabase.from as unknown as ReturnType<typeof vi.fn>;
    const realNow = Date.now;

    try {
      const T0 = Date.parse('2026-05-01T12:00:00Z');
      Date.now = () => T0;

      await enrichContext({ kind: 'person', id: 'c_42' }, 'space_1', { now: NOW });
      const callsAfterFirst = fromSpy.mock.calls.length;

      // Hop forward 5 minutes + 1 second — strictly past TTL_MS.
      Date.now = () => T0 + 5 * 60 * 1000 + 1000;

      await enrichContext({ kind: 'person', id: 'c_42' }, 'space_1', { now: NOW });
      expect(fromSpy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    } finally {
      Date.now = realNow;
    }
  });

  it('keys cache by spaceId, kind, and id — different keys do not collide', async () => {
    // First call: a person under space_1.
    setMayaFixtures();
    const a = await enrichContext({ kind: 'person', id: 'c_42' }, 'space_1', { now: NOW });
    expect(a!.subjectLabel).toBe('Maya Chen');

    // Different id under the same space — must NOT return Maya.
    setContact({
      id: 'c_99',
      name: 'Jordan Park',
      scoreLabel: 'warm',
      leadScore: 60,
      lastContactedAt: '2026-04-30T08:00:00Z',
    });
    setActivities([]);
    const b = await enrichContext({ kind: 'person', id: 'c_99' }, 'space_1', { now: NOW });
    expect(b!.subjectLabel).toBe('Jordan Park');

    // Different space, same id — must NOT return Maya either.
    setContact({
      id: 'c_42',
      name: 'Different-tenant Maya',
      scoreLabel: 'cold',
      leadScore: 20,
      lastContactedAt: null,
    });
    setActivities([]);
    const c = await enrichContext({ kind: 'person', id: 'c_42' }, 'space_2', { now: NOW });
    expect(c!.subjectLabel).toBe('Different-tenant Maya');

    // Same kind, different kind on same id — must NOT collide.
    setDeal({
      id: 'c_42',
      title: 'Deal-shaped c_42',
      contactId: null,
      status: 'active',
      stageId: null,
      updatedAt: '2026-04-30T00:00:00Z',
    });
    const d = await enrichContext({ kind: 'deal', id: 'c_42' }, 'space_1', { now: NOW });
    expect(d!.subjectLabel).toBe('Deal-shaped c_42');
  });

  it('does not cache misses (null results) — a later create-then-query lands fresh data', async () => {
    setContact(null);
    setActivities([]);
    const first = await enrichContext({ kind: 'person', id: 'c_late' }, 'space_1', { now: NOW });
    expect(first).toBeNull();

    // Now the row exists.
    setContact({
      id: 'c_late',
      name: 'Late Larry',
      scoreLabel: 'warm',
      leadScore: 55,
      lastContactedAt: '2026-04-30T00:00:00Z',
    });
    setActivities([]);
    const second = await enrichContext({ kind: 'person', id: 'c_late' }, 'space_1', { now: NOW });
    expect(second).not.toBeNull();
    expect(second!.subjectLabel).toBe('Late Larry');
  });

  it('__resetEnrichContextCacheForTests forces the next call to re-query', async () => {
    setMayaFixtures();
    const fromSpy = supabase.from as unknown as ReturnType<typeof vi.fn>;

    await enrichContext({ kind: 'person', id: 'c_42' }, 'space_1', { now: NOW });
    const callsAfterFirst = fromSpy.mock.calls.length;

    // Without reset: cached, no new calls.
    await enrichContext({ kind: 'person', id: 'c_42' }, 'space_1', { now: NOW });
    expect(fromSpy.mock.calls.length).toBe(callsAfterFirst);

    __resetEnrichContextCacheForTests();
    await enrichContext({ kind: 'person', id: 'c_42' }, 'space_1', { now: NOW });
    expect(fromSpy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});

describe('renderEnrichedContextBlock', () => {
  it('wraps the body in [SUBJECT CONTEXT] / [/SUBJECT CONTEXT] tags', () => {
    const text = renderEnrichedContextBlock({
      subjectLabel: 'Maya Chen',
      scoreLabel: 'hot',
      leadScore: 88,
      lastActivities: ['2026-04-29 — email: tour confirmation'],
      daysSinceLastTouch: 3,
    });
    expect(text.startsWith('[SUBJECT CONTEXT]')).toBe(true);
    expect(text.endsWith('[/SUBJECT CONTEXT]')).toBe(true);
    expect(text).toContain('Subject: Maya Chen');
    expect(text).toContain('Score: hot (88)');
    expect(text).toContain('- 2026-04-29 — email: tour confirmation');
  });
});

describe('renderEnrichedContext', () => {
  it('renders a stable SUBJECT CONTEXT block the model can pattern-match', () => {
    const text = renderEnrichedContext({
      subjectLabel: 'Maya Chen',
      scoreLabel: 'hot',
      leadScore: 88,
      lastActivities: ['2026-04-29 — email: tour confirmation'],
      daysSinceLastTouch: 3,
    });
    expect(text).toContain('SUBJECT CONTEXT');
    expect(text).toContain('Subject: Maya Chen');
    expect(text).toContain('Score: hot (88)');
    expect(text).toContain('Days since last touch: 3');
    expect(text).toContain('- 2026-04-29 — email: tour confirmation');
  });

  it('says "none recorded" when there are no activities', () => {
    const text = renderEnrichedContext({
      subjectLabel: 'Empty Ed',
      lastActivities: [],
      daysSinceLastTouch: null,
    });
    expect(text).toContain('Recent activity: none recorded');
    expect(text).toContain('Days since last touch: unknown');
  });
});
