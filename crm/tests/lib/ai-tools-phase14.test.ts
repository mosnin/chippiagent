/**
 * Phase 14 — the 12 hero-demo tools (10 actually shipping; see PR notes for
 * the two that needed schema columns the Contact table doesn't have).
 *
 * Two tests per tool: happy path and either a not-found or schema-validation
 * negative case. Same supabase mock shape as phase5 — see comments there.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockByTable: Record<
  string,
  { rows?: Array<Record<string, unknown>>; error?: { message: string } | null; single?: Record<string, unknown> | null }
> = {};

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const override = mockByTable[table];
    const rows = override?.rows ?? [];
    const error = override?.error ?? null;
    const single = override?.single;

    const termThen = Promise.resolve({ data: rows, error });
    const singleThen = Promise.resolve({ data: single ?? rows[0] ?? null, error });

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    chain.select = vi.fn(passthrough);
    chain.eq = vi.fn(passthrough);
    chain.is = vi.fn(passthrough);
    chain.in = vi.fn(passthrough);
    chain.neq = vi.fn(passthrough);
    chain.order = vi.fn(passthrough);
    chain.limit = vi.fn(passthrough);
    chain.update = vi.fn(passthrough);
    chain.delete = vi.fn(passthrough);
    chain.insert = vi.fn(passthrough);
    chain.maybeSingle = vi.fn(() => singleThen);
    chain.single = vi.fn(() => singleThen);
    chain.abortSignal = vi.fn(() => termThen);
    chain.then = (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) => termThen.then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

const { syncContactMock, syncDealMock } = vi.hoisted(() => ({
  syncContactMock: vi.fn(async () => undefined),
  syncDealMock: vi.fn(async () => undefined),
}));
vi.mock('@/lib/vectorize', () => ({
  syncContact: syncContactMock,
  syncDeal: syncDealMock,
  deleteContactVector: vi.fn(),
  deleteDealVector: vi.fn(),
}));

import { logCallTool } from '@/lib/ai-tools/tools/log-call';
import { logMeetingTool } from '@/lib/ai-tools/tools/log-meeting';
import { setFollowupTool, resolveWhen } from '@/lib/ai-tools/tools/set-followup';
import { clearFollowupTool } from '@/lib/ai-tools/tools/clear-followup';
import { markPersonHotTool } from '@/lib/ai-tools/tools/mark-person-hot';
import { markPersonColdTool } from '@/lib/ai-tools/tools/mark-person-cold';
import { archivePersonTool } from '@/lib/ai-tools/tools/archive-person';
import { noteOnPersonTool } from '@/lib/ai-tools/tools/note-on-person';
import { noteOnDealTool } from '@/lib/ai-tools/tools/note-on-deal';
import { markDealWonTool } from '@/lib/ai-tools/tools/mark-deal-won';
import { markDealLostTool } from '@/lib/ai-tools/tools/mark-deal-lost';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'user_1',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u1' },
    signal: new AbortController().signal,
  };
}

beforeEach(() => {
  mockByTable = {};
  syncContactMock.mockClear();
  syncDealMock.mockClear();
});

// ── log_call ─────────────────────────────────────────────────────────────
describe('logCallTool', () => {
  it('logs a call against an existing contact', async () => {
    mockByTable = { Contact: { single: { id: 'c_1', name: 'Sam' } } };
    const result = await logCallTool.handler(
      { personId: 'c_1', summary: 'Walked through Friday tour follow-up.', sentiment: 'positive', durationMins: 12 },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(result.summary).toMatch(/Sam/);
  });

  it('errors when the contact is missing', async () => {
    mockByTable = { Contact: { single: null } };
    const result = await logCallTool.handler(
      { personId: 'missing', summary: 'hi' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No contact/);
  });
});

// ── log_meeting ──────────────────────────────────────────────────────────
describe('logMeetingTool', () => {
  it('logs a meeting with a location', async () => {
    mockByTable = { Contact: { single: { id: 'c_1', name: 'Sam' } } };
    const result = await logMeetingTool.handler(
      { personId: 'c_1', summary: 'Toured 123 Main', location: '123 Main' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(result.summary).toMatch(/Sam/);
  });

  it('rejects an empty summary', () => {
    expect(() => logMeetingTool.parameters.parse({ personId: 'c_1', summary: '' })).toThrow();
  });
});

// ── set_followup ─────────────────────────────────────────────────────────
describe('setFollowupTool', () => {
  it('resolves "tomorrow" and stores the follow-up', async () => {
    mockByTable = { Contact: { single: { id: 'c_1', name: 'Sam' } } };
    const result = await setFollowupTool.handler(
      { personId: 'c_1', when: 'tomorrow', note: 'Check in re: school district' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect((result.data as { followUpAt: string }).followUpAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('errors on an unparseable phrase', async () => {
    mockByTable = { Contact: { single: { id: 'c_1', name: 'Sam' } } };
    const result = await setFollowupTool.handler(
      { personId: 'c_1', when: 'banana o\'clock' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/parse/);
  });

  it('resolveWhen handles ISO, today, weekday, next-weekday', () => {
    const ref = new Date('2026-05-01T12:00:00.000Z'); // a Friday
    expect(resolveWhen('2026-05-08', ref)).toMatch(/^2026-05-08/);
    expect(resolveWhen('today', ref)).toMatch(/^2026-05-01/);
    expect(resolveWhen('Friday', ref)).toMatch(/^2026-05-08/); // skips today, picks next Fri
    expect(resolveWhen('next Mon', ref)).toMatch(/^2026-05-11/);
    expect(resolveWhen('not a date', ref)).toBeNull();
  });
});

// ── clear_followup ───────────────────────────────────────────────────────
describe('clearFollowupTool', () => {
  it('clears the follow-up on an existing contact', async () => {
    mockByTable = { Contact: { single: { id: 'c_1', name: 'Sam' } } };
    const result = await clearFollowupTool.handler(
      { personId: 'c_1', why: 'Closed the loop on the offer' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(result.summary).toMatch(/Cleared/);
  });

  it('requires a reason', () => {
    expect(() => clearFollowupTool.parameters.parse({ personId: 'c_1' })).toThrow();
  });
});

// ── mark_person_hot ──────────────────────────────────────────────────────
describe('markPersonHotTool', () => {
  it('bumps an unscored contact up to the hot threshold', async () => {
    mockByTable = { Contact: { single: { id: 'c_1', name: 'Jane Chen', leadScore: null } } };
    const result = await markPersonHotTool.handler(
      { personId: 'c_1', why: 'Asked to make an offer at $1.1M.' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(result.summary).toMatch(/Jane Chen/);
    expect((result.data as { leadScore: number }).leadScore).toBeGreaterThanOrEqual(70);
  });

  it('errors when the contact is missing', async () => {
    mockByTable = { Contact: { single: null } };
    const result = await markPersonHotTool.handler(
      { personId: 'missing', why: 'because' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No contact/);
  });
});

// ── mark_person_cold ─────────────────────────────────────────────────────
describe('markPersonColdTool', () => {
  it('clamps a high score down to 30', async () => {
    mockByTable = { Contact: { single: { id: 'c_1', name: 'Pat', leadScore: 80 } } };
    const result = await markPersonColdTool.handler(
      { personId: 'c_1', why: 'Bought elsewhere.' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect((result.data as { leadScore: number }).leadScore).toBe(30);
  });

  it('rejects a missing reason', () => {
    expect(() => markPersonColdTool.parameters.parse({ personId: 'c_1' })).toThrow();
  });
});

// ── archive_person ───────────────────────────────────────────────────────
describe('archivePersonTool', () => {
  it('archives an existing contact', async () => {
    mockByTable = { Contact: { single: { id: 'c_1', name: 'Old Lead' } } };
    const result = await archivePersonTool.handler(
      { personId: 'c_1', reason: 'Moved out of state.' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(result.summary).toMatch(/Archived/);
  });

  it('errors when the contact is missing', async () => {
    mockByTable = { Contact: { single: null } };
    const result = await archivePersonTool.handler(
      { personId: 'missing', reason: 'x' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No contact/);
  });
});

// ── note_on_person ───────────────────────────────────────────────────────
describe('noteOnPersonTool', () => {
  it('appends a plain note', async () => {
    mockByTable = { Contact: { single: { id: 'c_1', name: 'Sam' } } };
    const result = await noteOnPersonTool.handler(
      { personId: 'c_1', content: 'Wife worried about school district.' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(result.summary).toMatch(/Sam/);
  });

  it('rejects empty content', () => {
    expect(() => noteOnPersonTool.parameters.parse({ personId: 'c_1', content: '' })).toThrow();
  });
});

// ── note_on_deal ─────────────────────────────────────────────────────────
describe('noteOnDealTool', () => {
  it('appends a plain note to a deal', async () => {
    mockByTable = { Deal: { single: { id: 'd_1', title: 'Parkside listing' } } };
    const result = await noteOnDealTool.handler(
      { dealId: 'd_1', content: 'Inspector flagged roof.' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(result.summary).toMatch(/Parkside listing/);
  });

  it('errors when the deal is missing', async () => {
    mockByTable = { Deal: { single: null } };
    const result = await noteOnDealTool.handler(
      { dealId: 'missing', content: 'hi' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No deal/);
  });
});

// ── mark_deal_won ────────────────────────────────────────────────────────
describe('markDealWonTool', () => {
  it('marks a deal won with a final value and reindexes', async () => {
    mockByTable = {
      Deal: { single: { id: 'd_1', title: 'Parkside listing', status: 'active', value: 1000000 } },
    };
    const result = await markDealWonTool.handler(
      { dealId: 'd_1', finalValue: 1100000, note: 'Closed at asking.' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(result.summary).toMatch(/Parkside listing/);
    expect(result.summary).toMatch(/1,100,000/);
    expect(syncDealMock).toHaveBeenCalledTimes(1);
  });

  it('errors when the deal is missing', async () => {
    mockByTable = { Deal: { single: null } };
    const result = await markDealWonTool.handler(
      { dealId: 'missing' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No deal/);
  });
});

// ── mark_deal_lost ───────────────────────────────────────────────────────
describe('markDealLostTool', () => {
  it('marks a deal lost with a reason and reindexes', async () => {
    mockByTable = {
      Deal: { single: { id: 'd_1', title: 'Parkside listing', status: 'active' } },
    };
    const result = await markDealLostTool.handler(
      { dealId: 'd_1', reason: 'Buyer financing fell through.' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(result.summary).toMatch(/Parkside listing/);
    expect(syncDealMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty reason', () => {
    expect(() => markDealLostTool.parameters.parse({ dealId: 'd_1', reason: '' })).toThrow();
  });
});
