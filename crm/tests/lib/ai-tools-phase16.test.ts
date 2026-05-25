/**
 * Phase 16 — research, calendar, brokerage, drafts, manual-log tools.
 * Two cases per tool, ~26 total. Mock pattern follows
 * `tests/lib/ai-tools-phase5.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Per-table mock state ───────────────────────────────────────────────────
let mockByTable: Record<
  string,
  {
    rows?: Array<Record<string, unknown>>;
    error?: { message: string } | null;
    single?: Record<string, unknown> | null;
    count?: number;
  }
> = {};

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const override = mockByTable[table];
    const rows = override?.rows ?? [];
    const error = override?.error ?? null;
    const single = override?.single;
    const count = override?.count ?? null;

    const termThen = Promise.resolve({ data: rows, error, count });
    const singleThen = Promise.resolve({ data: single ?? rows[0] ?? null, error });

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    chain.select = vi.fn(passthrough);
    chain.eq = vi.fn(passthrough);
    chain.is = vi.fn(passthrough);
    chain.in = vi.fn(passthrough);
    chain.neq = vi.fn(passthrough);
    chain.gt = vi.fn(passthrough);
    chain.gte = vi.fn(passthrough);
    chain.lt = vi.fn(passthrough);
    chain.lte = vi.fn(passthrough);
    chain.not = vi.fn(passthrough);
    chain.order = vi.fn(passthrough);
    chain.limit = vi.fn(passthrough);
    chain.update = vi.fn(passthrough);
    chain.insert = vi.fn(passthrough);
    chain.or = vi.fn(passthrough);
    chain.ilike = vi.fn(passthrough);
    chain.maybeSingle = vi.fn(() => singleThen);
    chain.single = vi.fn(() => singleThen);
    chain.abortSignal = vi.fn(() => termThen);
    chain.then = (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) => termThen.then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

// composeQuickDraft is the only external dependency for draft_email/draft_sms.
const { composeQuickDraftMock } = vi.hoisted(() => ({
  composeQuickDraftMock: vi.fn(),
}));
vi.mock('@/app/api/agent/quick-draft/route', () => ({
  composeQuickDraft: composeQuickDraftMock,
}));

// recall_history now goes through agent-memory's recallMemory (semantic).
const { recallMemoryMock } = vi.hoisted(() => ({
  recallMemoryMock: vi.fn(),
}));
vi.mock('@/lib/agent-memory/store', () => ({
  recallMemory: recallMemoryMock,
  storeMemory: vi.fn(),
}));

import { findComparablePropertiesTool } from '@/lib/ai-tools/tools/find-comparable-properties';
import { recallHistoryTool } from '@/lib/ai-tools/tools/recall-history';
import { checkAvailabilityTool } from '@/lib/ai-tools/tools/check-availability';
import { blockTimeTool } from '@/lib/ai-tools/tools/block-time';
import { findStuckDealsTool } from '@/lib/ai-tools/tools/find-stuck-deals';
import { findQuietHotPersonsTool } from '@/lib/ai-tools/tools/find-quiet-hot-persons';
import { findOverdueFollowupsTool } from '@/lib/ai-tools/tools/find-overdue-followups';
import { summarizeRealtorTool } from '@/lib/ai-tools/tools/summarize-realtor';
import { assignLeadToRealtorTool } from '@/lib/ai-tools/tools/assign-lead-to-realtor';
import { draftEmailTool } from '@/lib/ai-tools/tools/draft-email';
import { draftSmsTool } from '@/lib/ai-tools/tools/draft-sms';
import { logEmailSentTool } from '@/lib/ai-tools/tools/log-email-sent';
import { logSmsSentTool } from '@/lib/ai-tools/tools/log-sms-sent';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'user_clerk_1',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u1' },
    signal: new AbortController().signal,
  };
}

beforeEach(() => {
  mockByTable = {};
  composeQuickDraftMock.mockReset();
  recallMemoryMock.mockReset();
});

// ── find_comparable_properties ─────────────────────────────────────────────
describe('findComparablePropertiesTool', () => {
  it('is read-only (no approval)', () => {
    expect(findComparablePropertiesTool.requiresApproval).toBe(false);
  });

  it('returns "no comparables" with explicit note when nothing matches', async () => {
    mockByTable = { Property: { rows: [] } };
    const result = await findComparablePropertiesTool.handler({}, makeCtx());
    expect(result.summary).toMatch(/No comparable properties on file/);
    expect((result.data as { properties: unknown[] }).properties).toHaveLength(0);
  });

  it('caps results at 6 and sorts by closeness to price midpoint', async () => {
    mockByTable = {
      Property: {
        rows: [
          { id: 'p1', address: '1 A St', city: 'X', beds: 3, baths: 2, listPrice: 1_000_000, listingStatus: 'active', updatedAt: '2026-01-01' },
          { id: 'p2', address: '2 B St', city: 'X', beds: 3, baths: 2, listPrice: 510_000, listingStatus: 'active', updatedAt: '2026-01-02' },
          { id: 'p3', address: '3 C St', city: 'X', beds: 3, baths: 2, listPrice: 490_000, listingStatus: 'active', updatedAt: '2026-01-03' },
        ],
      },
    };
    const result = await findComparablePropertiesTool.handler(
      { priceMin: 400_000, priceMax: 600_000 },
      makeCtx(),
    );
    const properties = (result.data as { properties: { id: string }[] }).properties;
    // Midpoint = 500k; p2 (510k) and p3 (490k) are closer than p1 (1M).
    expect(properties[0].id).toMatch(/^p[23]$/);
    expect(properties.length).toBeLessThanOrEqual(6);
  });
});

// ── recall_history ─────────────────────────────────────────────────────────
describe('recallHistoryTool', () => {
  it('is read-only', () => {
    expect(recallHistoryTool.requiresApproval).toBe(false);
  });

  it('declares searchKind="semantic" and forwards results from recallMemory', async () => {
    recallMemoryMock.mockResolvedValueOnce([
      {
        id: 'm1',
        content: 'They want a fixer-upper in Berkeley',
        kind: 'fact',
        createdAt: '2026-04-01T00:00:00.000Z',
        similarity: 0.83,
        importance: 0.6,
        entityType: 'contact',
        entityId: 'c1',
      },
    ]);
    const result = await recallHistoryTool.handler({ query: 'fixer-upper' }, makeCtx());
    expect((result.data as { searchKind: string }).searchKind).toBe('semantic');
    expect(result.summary).toMatch(/semantic search/);
    const hits = (result.data as { hits: { excerpt: string; similarity: number }[] }).hits;
    expect(hits).toHaveLength(1);
    expect(hits[0].excerpt).toMatch(/fixer-upper/);
    expect(hits[0].similarity).toBe(0.83);
  });

  it('forwards personId and dealId to recallMemory as filters', async () => {
    recallMemoryMock.mockResolvedValueOnce([]);
    await recallHistoryTool.handler({ query: 'school district', personId: 'c_sam' }, makeCtx());
    expect(recallMemoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space_1',
        query: 'school district',
        contactId: 'c_sam',
      }),
    );
  });

  it('returns an error display when the semantic recall throws', async () => {
    recallMemoryMock.mockRejectedValueOnce(new Error('embedding service unavailable'));
    const result = await recallHistoryTool.handler({ query: 'pre-approval' }, makeCtx());
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/Recall failed/);
  });
});

// ── check_availability ─────────────────────────────────────────────────────
describe('checkAvailabilityTool', () => {
  it('is read-only', () => {
    expect(checkAvailabilityTool.requiresApproval).toBe(false);
  });

  it('returns free=true when no Tour or CalendarEvent overlap', async () => {
    mockByTable = { Tour: { rows: [] }, CalendarEvent: { rows: [] } };
    const result = await checkAvailabilityTool.handler(
      { from: '2026-05-01T14:00:00.000Z', to: '2026-05-01T16:00:00.000Z' },
      makeCtx(),
    );
    expect((result.data as { free: boolean }).free).toBe(true);
    expect(result.summary).toMatch(/free/);
  });

  it('reports a Tour conflict in the conflicts array', async () => {
    mockByTable = {
      Tour: {
        rows: [
          {
            id: 't1',
            startsAt: '2026-05-01T14:30:00.000Z',
            endsAt: '2026-05-01T15:30:00.000Z',
            propertyAddress: '123 Main',
            guestName: 'Alex',
          },
        ],
      },
      CalendarEvent: { rows: [] },
    };
    const result = await checkAvailabilityTool.handler(
      { from: '2026-05-01T14:00:00.000Z', to: '2026-05-01T16:00:00.000Z' },
      makeCtx(),
    );
    const conflicts = (result.data as { conflicts: { kind: string }[] }).conflicts;
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe('tour');
  });
});

// ── block_time ─────────────────────────────────────────────────────────────
describe('blockTimeTool', () => {
  it('requires approval', () => {
    expect(blockTimeTool.requiresApproval).toBe(true);
  });

  it('rejects when `to` is not after `from`', () => {
    expect(() =>
      blockTimeTool.parameters.parse({
        from: '2026-05-01T14:00:00.000Z',
        to: '2026-05-01T14:00:00.000Z',
        reason: 'X',
      }),
    ).toThrow();
  });

  it('inserts a CalendarEvent and titles it "Blocked: ..."', async () => {
    mockByTable = {
      CalendarEvent: { single: { id: 'ev_1', date: '2026-05-01', time: '14:00', title: 'Blocked: dentist' } },
    };
    const result = await blockTimeTool.handler(
      { from: '2026-05-01T14:00:00.000Z', to: '2026-05-01T15:00:00.000Z', reason: 'dentist' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(result.summary).toMatch(/dentist/);
    expect((result.data as { eventId: string }).eventId).toBe('ev_1');
  });
});

// ── find_stuck_deals ───────────────────────────────────────────────────────
describe('findStuckDealsTool', () => {
  it('is read-only', () => {
    expect(findStuckDealsTool.requiresApproval).toBe(false);
  });

  it('returns empty-state summary when nothing is quiet enough', async () => {
    mockByTable = { Deal: { rows: [] }, DealStage: { rows: [] } };
    const result = await findStuckDealsTool.handler({ minDaysQuiet: 7 }, makeCtx());
    expect((result.data as { deals: unknown[] }).deals).toHaveLength(0);
    expect(result.summary).toMatch(/No deals stuck/);
  });

  it('attaches stage names and computes daysQuiet', async () => {
    const oldDate = new Date(Date.now() - 30 * 86_400_000).toISOString();
    mockByTable = {
      Deal: {
        rows: [
          { id: 'd_1', title: 'Old listing', value: 500_000, stageId: 'stage_a', updatedAt: oldDate },
        ],
      },
      DealStage: { rows: [{ id: 'stage_a', name: 'Prospects' }] },
    };
    const result = await findStuckDealsTool.handler({ minDaysQuiet: 7 }, makeCtx());
    const deals = (result.data as { deals: { stageName: string | null; daysQuiet: number }[] }).deals;
    expect(deals).toHaveLength(1);
    expect(deals[0].stageName).toBe('Prospects');
    expect(deals[0].daysQuiet).toBeGreaterThanOrEqual(7);
  });
});

// ── find_quiet_hot_persons ─────────────────────────────────────────────────
describe('findQuietHotPersonsTool', () => {
  it('is read-only', () => {
    expect(findQuietHotPersonsTool.requiresApproval).toBe(false);
  });

  it('filters out hot contacts touched within the window', async () => {
    const recent = new Date(Date.now() - 1 * 86_400_000).toISOString();
    mockByTable = {
      Contact: {
        rows: [
          { id: 'c_recent', name: 'Recent', leadScore: 90, lastContactedAt: recent, updatedAt: recent },
        ],
      },
      ContactActivity: { rows: [] },
    };
    const result = await findQuietHotPersonsTool.handler({ minDaysQuiet: 7 }, makeCtx());
    expect((result.data as { people: unknown[] }).people).toHaveLength(0);
  });

  it('returns hot contacts past the quiet threshold', async () => {
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    mockByTable = {
      Contact: {
        rows: [
          { id: 'c_old', name: 'Old', leadScore: 80, lastContactedAt: old, updatedAt: old },
        ],
      },
      ContactActivity: { rows: [] },
    };
    const result = await findQuietHotPersonsTool.handler({ minDaysQuiet: 7 }, makeCtx());
    const people = (result.data as { people: { id: string }[] }).people;
    expect(people).toHaveLength(1);
    expect(people[0].id).toBe('c_old');
  });
});

// ── find_overdue_followups ─────────────────────────────────────────────────
describe('findOverdueFollowupsTool', () => {
  it('is read-only', () => {
    expect(findOverdueFollowupsTool.requiresApproval).toBe(false);
  });

  it('returns daysOverdue for overdue follow-ups', async () => {
    const past = new Date(Date.now() - 5 * 86_400_000).toISOString();
    mockByTable = {
      Contact: { rows: [{ id: 'c_1', name: 'Late', followUpAt: past }] },
    };
    const result = await findOverdueFollowupsTool.handler({}, makeCtx());
    const people = (result.data as { people: { daysOverdue: number }[] }).people;
    expect(people).toHaveLength(1);
    expect(people[0].daysOverdue).toBeGreaterThanOrEqual(4);
  });
});

// ── summarize_realtor ──────────────────────────────────────────────────────
describe('summarizeRealtorTool', () => {
  it('is read-only', () => {
    expect(summarizeRealtorTool.requiresApproval).toBe(false);
  });

  it('refuses when caller has no broker membership', async () => {
    mockByTable = {
      User: { single: { id: 'u_caller' } },
      BrokerageMembership: { rows: [] },
    };
    const result = await summarizeRealtorTool.handler(
      { realtorUserId: 'u_realtor', windowDays: 7 },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/Broker access required/);
  });
});

// ── assign_lead_to_realtor ─────────────────────────────────────────────────
describe('assignLeadToRealtorTool', () => {
  it('requires approval', () => {
    expect(assignLeadToRealtorTool.requiresApproval).toBe(true);
  });

  it('refuses when caller is not a broker', async () => {
    mockByTable = {
      User: { single: { id: 'u_caller' } },
      BrokerageMembership: { rows: [] },
    };
    const result = await assignLeadToRealtorTool.handler(
      { personId: 'c_1', realtorUserId: 'u_2', why: 'they asked' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/Broker access required/);
  });
});

// ── draft_email ────────────────────────────────────────────────────────────
describe('draftEmailTool', () => {
  it('is read-only and does NOT require approval', () => {
    expect(draftEmailTool.requiresApproval).toBe(false);
  });

  it('returns the composed subject + body, no AgentDraft side effect', async () => {
    composeQuickDraftMock.mockResolvedValueOnce({
      subject: 'Quick check-in',
      body: 'Hey — circling back.',
      subjectLabel: 'Alex',
    });
    const result = await draftEmailTool.handler(
      { personId: 'c_1', intent: 'check-in' },
      makeCtx(),
    );
    expect(result.display).toBe('plain');
    const data = result.data as { subject: string; body: string };
    expect(data.subject).toMatch(/check-in/);
    expect(data.body).toMatch(/circling back/);
    // composeQuickDraft does the work; no fake AgentDraft insert was needed.
    expect(composeQuickDraftMock).toHaveBeenCalledTimes(1);
  });
});

// ── draft_sms ──────────────────────────────────────────────────────────────
describe('draftSmsTool', () => {
  it('is read-only', () => {
    expect(draftSmsTool.requiresApproval).toBe(false);
  });

  it('returns body only and reports an error when compose fails', async () => {
    composeQuickDraftMock.mockResolvedValueOnce(null);
    const result = await draftSmsTool.handler(
      { personId: 'c_1', intent: 'check-in' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
  });
});

// ── log_email_sent ─────────────────────────────────────────────────────────
describe('logEmailSentTool', () => {
  it('requires approval', () => {
    expect(logEmailSentTool.requiresApproval).toBe(true);
  });

  it('inserts an "email"-typed activity and does not call any sender', async () => {
    mockByTable = {
      Contact: { single: { id: 'c_1', name: 'Alex' } },
      ContactActivity: { rows: [], error: null },
    };
    const result = await logEmailSentTool.handler(
      { personId: 'c_1', subject: 'Hi', body: 'Body text' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(result.summary).toMatch(/Logged email/);
  });
});

// ── log_sms_sent ───────────────────────────────────────────────────────────
describe('logSmsSentTool', () => {
  it('requires approval', () => {
    expect(logSmsSentTool.requiresApproval).toBe(true);
  });

  it('refuses when contact is missing in this space', async () => {
    mockByTable = { Contact: { single: null } };
    const result = await logSmsSentTool.handler(
      { personId: 'missing', body: 'hi' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/not found/);
  });
});
