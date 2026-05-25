import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared supabase chain mock ─────────────────────────────────────────────
// pipeline_summary builds a chained query (`.from().select().eq()...`). We
// return a thenable-ish chain that resolves to whatever `mockRows` /
// `mockError` are currently set to.

let mockRows: Array<Record<string, unknown>> = [];
let mockError: { message: string } | null = null;

vi.mock('@/lib/supabase', () => {
  function makeChain(): Record<string, unknown> {
    const terminalThenable = Promise.resolve({ data: mockRows, error: mockError });

    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      not: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      or: vi.fn(() => chain),
      ilike: vi.fn(() => chain),
      maybeSingle: vi.fn(() => Promise.resolve({ data: mockRows[0] ?? null, error: mockError })),
      abortSignal: vi.fn(() => chain),
      then: (
        resolve: (v: { data: unknown; error: unknown }) => unknown,
        reject?: (e: unknown) => unknown,
      ) => terminalThenable.then(resolve, reject),
    };
    return chain;
  }
  return {
    supabase: { from: vi.fn(() => makeChain()) },
  };
});

import { pipelineSummaryTool } from '@/lib/ai-tools/tools/pipeline-summary';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'user_1',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u1' },
    signal: new AbortController().signal,
  };
}

beforeEach(() => {
  mockRows = [];
  mockError = null;
});

// ── pipeline_summary ───────────────────────────────────────────────────────

describe('pipelineSummaryTool', () => {
  it('summarises an empty pipeline tersely', async () => {
    mockRows = [];
    const result = await pipelineSummaryTool.handler({ includeLostWon: false }, makeCtx());
    expect(result.summary).toMatch(/0 active deals/);
  });

  it('surfaces closing-this-week + totals', async () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    mockRows = [
      {
        id: 'd1',
        title: 'Close soon',
        status: 'active',
        value: 500_000,
        closeDate: soon.toISOString(),
        followUpAt: null,
        updatedAt: new Date().toISOString(),
        nextAction: null,
        nextActionDueAt: null,
      },
      {
        id: 'd2',
        title: 'Not this week',
        status: 'active',
        value: 200_000,
        closeDate: null,
        followUpAt: null,
        updatedAt: new Date().toISOString(),
        nextAction: null,
        nextActionDueAt: null,
      },
    ];
    const result = await pipelineSummaryTool.handler({ includeLostWon: false }, makeCtx());
    expect(result.summary).toMatch(/2 active deals/);
    expect(result.summary).toMatch(/1 closing this week/);
    const { summary } = result.data as { summary: { closingThisWeek: { count: number; totalValue: number } } };
    expect(summary.closingThisWeek.count).toBe(1);
    expect(summary.closingThisWeek.totalValue).toBe(500_000);
  });

  it('is auto-run', () => {
    expect(pipelineSummaryTool.requiresApproval).toBe(false);
  });
});
