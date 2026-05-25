/**
 * Voice-sample helper tests.
 *
 * Covers:
 *   - empty result when nothing matches
 *   - single sample is suppressed (MIN_SAMPLES = 2)
 *   - filter shape: spaceId, channel='email', feedback_action,
 *     edit_distance > threshold, status in (sent, approved), date cutoff
 *   - cap at 3, ordered by updatedAt DESC
 *   - cache hit (no second supabase call) and cache reset
 *   - returned shape: only subject + body, no PII columns
 *   - voice samples pass through unmodified — recipient-name leak protection
 *     is the prompt instruction, not a regex on the body
 *   - truncation at sentence boundary or with ellipsis
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface ChainCapture {
  table: string;
  selects: string[];
  eqs: Array<{ col: string; val: unknown }>;
  ins: Array<{ col: string; val: unknown }>;
  gts: Array<{ col: string; val: unknown }>;
  gtes: Array<{ col: string; val: unknown }>;
  orders: Array<{ col: string; opts?: unknown }>;
  limits: number[];
}

let lastCapture: ChainCapture | null = null;
let mockRows: Array<Record<string, unknown>> = [];
let mockError: { message: string } | null = null;

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string) {
    const capture: ChainCapture = {
      table,
      selects: [],
      eqs: [],
      ins: [],
      gts: [],
      gtes: [],
      orders: [],
      limits: [],
    };
    lastCapture = capture;

    const terminal = (): Promise<{ data: unknown; error: unknown }> =>
      Promise.resolve({ data: mockRows, error: mockError });

    const chain: Record<string, unknown> = {
      select: vi.fn((cols: string) => {
        capture.selects.push(cols);
        return chain;
      }),
      eq: vi.fn((col: string, val: unknown) => {
        capture.eqs.push({ col, val });
        return chain;
      }),
      in: vi.fn((col: string, val: unknown) => {
        capture.ins.push({ col, val });
        return chain;
      }),
      gt: vi.fn((col: string, val: unknown) => {
        capture.gts.push({ col, val });
        return chain;
      }),
      gte: vi.fn((col: string, val: unknown) => {
        capture.gtes.push({ col, val });
        return chain;
      }),
      order: vi.fn((col: string, opts?: unknown) => {
        capture.orders.push({ col, opts });
        return chain;
      }),
      limit: vi.fn((n: number) => {
        capture.limits.push(n);
        return chain;
      }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        terminal().then(resolve, reject),
    };
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import {
  getRecentVoiceSamples,
  __resetDraftVoiceCacheForTests,
} from '@/lib/draft-voice';
import { supabase } from '@/lib/supabase';

const NOW = new Date('2026-05-01T12:00:00Z');

beforeEach(() => {
  __resetDraftVoiceCacheForTests();
  lastCapture = null;
  mockRows = [];
  mockError = null;
  vi.clearAllMocks();
});

describe('getRecentVoiceSamples — empty cases', () => {
  it('returns [] when supabase returns no rows', async () => {
    mockRows = [];
    const out = await getRecentVoiceSamples('s_1', { now: NOW });
    expect(out).toEqual([]);
  });

  it('returns [] when only one matching row exists (MIN_SAMPLES guard)', async () => {
    mockRows = [
      { subject: 'Hi', content: 'Wanted to circle back. Call me when free.' },
    ];
    const out = await getRecentVoiceSamples('s_1', { now: NOW });
    expect(out).toEqual([]);
  });

  it('returns [] when supabase errors (fail-closed, not crash)', async () => {
    mockError = { message: 'boom' };
    const out = await getRecentVoiceSamples('s_1', { now: NOW });
    expect(out).toEqual([]);
  });
});

describe('getRecentVoiceSamples — query shape', () => {
  it('filters by spaceId, channel=email, feedback_action, edit_distance>12, status, date cutoff', async () => {
    mockRows = [
      { subject: 'a', content: 'one. two.' },
      { subject: 'b', content: 'three. four.' },
    ];
    await getRecentVoiceSamples('s_1', { now: NOW });

    expect(lastCapture).not.toBeNull();
    expect(lastCapture!.table).toBe('AgentDraft');

    // SELECT must be subject+content only — no contactId, dealId, reasoning.
    // This is the structural defense: the helper literally cannot return a
    // column that ties a sample back to a specific person.
    const select = lastCapture!.selects.join(',');
    expect(select).toContain('subject');
    expect(select).toContain('content');
    expect(select).not.toMatch(/contactId/i);
    expect(select).not.toMatch(/dealId/i);
    expect(select).not.toMatch(/reasoning/i);

    // eq filters
    const eqMap = Object.fromEntries(
      lastCapture!.eqs.map((e) => [e.col, e.val]),
    );
    expect(eqMap.spaceId).toBe('s_1');
    expect(eqMap.channel).toBe('email');
    expect(eqMap.feedback_action).toBe('edited_and_approved');

    // status in [sent, approved]
    const statusIn = lastCapture!.ins.find((i) => i.col === 'status');
    expect(statusIn).toBeDefined();
    expect(statusIn!.val).toEqual(['sent', 'approved']);

    // edit_distance > threshold
    const editGt = lastCapture!.gts.find((g) => g.col === 'edit_distance');
    expect(editGt).toBeDefined();
    expect(typeof editGt!.val).toBe('number');
    expect(editGt!.val).toBeGreaterThanOrEqual(12);

    // 60-day cutoff
    const cutoff = lastCapture!.gtes.find((g) => g.col === 'updatedAt');
    expect(cutoff).toBeDefined();
    const cutoffDate = new Date(cutoff!.val as string);
    const expected = new Date(NOW.getTime() - 60 * 86_400_000);
    expect(Math.abs(cutoffDate.getTime() - expected.getTime())).toBeLessThan(2_000);

    // ordered by updatedAt DESC, capped
    expect(lastCapture!.orders[0].col).toBe('updatedAt');
    expect(lastCapture!.limits[0]).toBe(3);
  });
});

describe('getRecentVoiceSamples — return shape and cap', () => {
  it('caps at 3 samples', async () => {
    mockRows = [
      { subject: 's1', content: 'one. one.' },
      { subject: 's2', content: 'two. two.' },
      { subject: 's3', content: 'three. three.' },
    ];
    const out = await getRecentVoiceSamples('s_1', { now: NOW });
    expect(out).toHaveLength(3);
    expect(out[0].subject).toBe('s1');
  });

  it('returns only subject+body — no PII columns leak', async () => {
    mockRows = [
      {
        subject: 'a',
        content: 'one. one.',
        contactId: 'c_should_not_leak',
        dealId: 'd_should_not_leak',
        reasoning: 'should_not_leak',
      },
      { subject: 'b', content: 'two. two.', contactId: 'c2' },
    ];
    const out = await getRecentVoiceSamples('s_1', { now: NOW });
    expect(out).toHaveLength(2);
    for (const s of out) {
      expect(Object.keys(s).sort()).toEqual(['body', 'subject']);
    }
  });
});

describe('getRecentVoiceSamples — body is passed through unmodified', () => {
  it('returns the stored content verbatim — recipient-name leak defense lives in the prompt, not here', async () => {
    // The helper does not regex-scrub names. A regex catches "Hi Sam," and
    // misses "Hey Sam!", "Sam—", "Sam, thanks" — that's theater. The real
    // defense is the system message at the compose call site telling the
    // model not to reuse names from samples. Pin that behavior: bodies
    // arrive at the model the same way they were written.
    const a = 'Hi Sam,\n\nWanted to circle back. Talk soon.\n\n— Maya';
    const b = 'Hey Jane! Quick check-in. Free Tuesday?\n\nMaya Chen';
    mockRows = [
      { subject: 's1', content: a },
      { subject: 's2', content: b },
    ];
    const out = await getRecentVoiceSamples('s_1', { now: NOW });
    expect(out[0].body).toBe(a);
    expect(out[1].body).toBe(b);
  });
});

describe('getRecentVoiceSamples — truncation', () => {
  it('cuts at a sentence boundary when the body exceeds 400 chars', async () => {
    const longSentence = 'a'.repeat(150);
    // 150 + 2 + 150 + 2 + 150 + 2 + 14 = 470 chars — exceeds 400.
    // Sentence boundary (".") at index 152, 304, 456. minBoundary = 300, so
    // the boundary at 304 should be picked.
    const body =
      `${longSentence}. ${longSentence}. ${longSentence}. tail tail tail`;
    mockRows = [
      { subject: 'a', content: body },
      { subject: 'b', content: 'short. body.' },
    ];
    const out = await getRecentVoiceSamples('s_1', { now: NOW });
    expect(out[0].body.length).toBeLessThanOrEqual(400);
    // Must end on a period (sentence boundary), not mid-word.
    expect(out[0].body.endsWith('.')).toBe(true);
    expect(out[0].body).not.toContain('tail');
  });

  it('hard-cuts with an ellipsis when no sentence boundary is found late enough', async () => {
    const wall = 'a'.repeat(500);
    mockRows = [
      { subject: 'a', content: wall },
      { subject: 'b', content: 'short. body.' },
    ];
    const out = await getRecentVoiceSamples('s_1', { now: NOW });
    expect(out[0].body.length).toBeLessThanOrEqual(401);
    expect(out[0].body.endsWith('…')).toBe(true);
  });

  it('leaves short bodies untouched', async () => {
    mockRows = [
      { subject: 'a', content: 'Sounds good. Talk soon, all set.' },
      { subject: 'b', content: 'Confirming Tuesday at 3. Bringing the file.' },
    ];
    const out = await getRecentVoiceSamples('s_1', { now: NOW });
    expect(out[0].body).toBe('Sounds good. Talk soon, all set.');
    expect(out[1].body).toBe('Confirming Tuesday at 3. Bringing the file.');
  });
});

describe('getRecentVoiceSamples — cache', () => {
  it('serves second call from cache (no extra supabase round-trip)', async () => {
    mockRows = [
      { subject: 'a', content: 'one. one.' },
      { subject: 'b', content: 'two. two.' },
    ];
    const fromSpy = supabase.from as unknown as ReturnType<typeof vi.fn>;

    const a = await getRecentVoiceSamples('s_1', { now: NOW });
    const callsAfterFirst = fromSpy.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const b = await getRecentVoiceSamples('s_1', { now: NOW });
    expect(fromSpy.mock.calls.length).toBe(callsAfterFirst);
    expect(b).toEqual(a);
  });

  it('caches the empty result too — transient empties do not hammer the DB', async () => {
    mockRows = [];
    const fromSpy = supabase.from as unknown as ReturnType<typeof vi.fn>;

    await getRecentVoiceSamples('s_1', { now: NOW });
    const callsAfterFirst = fromSpy.mock.calls.length;
    await getRecentVoiceSamples('s_1', { now: NOW });
    expect(fromSpy.mock.calls.length).toBe(callsAfterFirst);
  });

  it('keys cache by spaceId — different spaces do not collide', async () => {
    mockRows = [
      { subject: 'a', content: 'one. one.' },
      { subject: 'b', content: 'two. two.' },
    ];
    const out1 = await getRecentVoiceSamples('s_1', { now: NOW });

    mockRows = [
      { subject: 'x', content: 'tenant-2 alpha. tenant-2 alpha.' },
      { subject: 'y', content: 'tenant-2 beta. tenant-2 beta.' },
    ];
    const out2 = await getRecentVoiceSamples('s_2', { now: NOW });

    expect(out1[0].subject).toBe('a');
    expect(out2[0].subject).toBe('x');
  });

  it('__resetDraftVoiceCacheForTests forces re-query', async () => {
    mockRows = [
      { subject: 'a', content: 'one. one.' },
      { subject: 'b', content: 'two. two.' },
    ];
    const fromSpy = supabase.from as unknown as ReturnType<typeof vi.fn>;

    await getRecentVoiceSamples('s_1', { now: NOW });
    const callsAfterFirst = fromSpy.mock.calls.length;

    await getRecentVoiceSamples('s_1', { now: NOW });
    expect(fromSpy.mock.calls.length).toBe(callsAfterFirst);

    __resetDraftVoiceCacheForTests();
    await getRecentVoiceSamples('s_1', { now: NOW });
    expect(fromSpy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});
