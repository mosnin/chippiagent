/**
 * Happy-path coverage for `find_person` and `find_deal`. Each tool has
 * three scenarios: ambiguous-list, single-rich-result (or exact name
 * match), and no-match.
 *
 * The supabase mock supports the chained-query shape these tools use,
 * including:
 *   - terminal `await chain.abortSignal()` (returns rows)
 *   - terminal `await chain` (returns rows for the in()/select()-only
 *     stage-name lookup)
 *   - chain.maybeSingle() (single-row reads inside enrichment)
 *
 * Per-table overrides via `mockByTable` so the same handler call can
 * receive different rows for Contact vs ContactActivity vs DealContact.
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
    const singleThen = Promise.resolve({
      data: single !== undefined ? single : (rows[0] ?? null),
      error,
    });

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    chain.select = vi.fn(passthrough);
    chain.eq = vi.fn(passthrough);
    chain.is = vi.fn(passthrough);
    chain.in = vi.fn(passthrough);
    chain.order = vi.fn(passthrough);
    chain.limit = vi.fn(passthrough);
    chain.not = vi.fn(passthrough);
    chain.lte = vi.fn(passthrough);
    chain.or = vi.fn(passthrough);
    chain.ilike = vi.fn(passthrough);
    chain.maybeSingle = vi.fn(() => singleThen);
    chain.abortSignal = vi.fn(() => termThen);
    chain.then = (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) => termThen.then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { findPersonTool } from '@/lib/ai-tools/tools/find-person';
import { findDealTool } from '@/lib/ai-tools/tools/find-deal';
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
});

// ── find_person ────────────────────────────────────────────────────────────

describe('findPersonTool', () => {
  it('is auto-run (no approval)', () => {
    expect(findPersonTool.requiresApproval).toBe(false);
  });

  it('returns match=none with a clear summary when nothing matches', async () => {
    mockByTable = { Contact: { rows: [] } };
    const result = await findPersonTool.handler({ query: 'ghost', limit: 8 }, makeCtx());
    expect(result.summary).toMatch(/No people/i);
    expect((result.data as { match: string }).match).toBe('none');
  });

  it('returns a single rich payload when only one row matches', async () => {
    mockByTable = {
      Contact: {
        rows: [
          {
            id: 'c_1',
            name: 'Jane Doe',
            email: 'jane@example.com',
            phone: '+14155550101',
            leadScore: 87,
            scoreLabel: 'hot',
            type: 'TOUR',
            followUpAt: null,
            lastContactedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
            snoozedUntil: null,
          },
        ],
      },
      ContactActivity: {
        rows: [
          {
            type: 'call',
            content: 'Discussed budget',
            createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
          },
        ],
      },
      DealContact: {
        rows: [
          { Deal: { id: 'd_1', status: 'active' } },
          { Deal: { id: 'd_2', status: 'lost' } },
        ],
      },
    };

    const result = await findPersonTool.handler({ query: 'jane', limit: 8 }, makeCtx());
    expect(result.display).toBe('contacts');
    const data = result.data as {
      match: string;
      person?: {
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
        leadScore: number | null;
        scoreLabel: string | null;
        type: string;
        status: string;
        followUpAt: string | null;
        days_since_last_touch: number | null;
        most_recent_activity: string | null;
        active_deal_count: number;
      };
    };
    expect(data.match).toBe('single');
    expect(data.person).toBeDefined();
    const p = data.person!;
    expect(p.id).toBe('c_1');
    expect(p.name).toBe('Jane Doe');
    expect(p.email).toBe('jane@example.com');
    expect(p.phone).toBe('+14155550101');
    expect(p.leadScore).toBe(87);
    expect(p.scoreLabel).toBe('hot');
    expect(p.type).toBe('TOUR');
    expect(p.status).toBe('active');
    expect(p.days_since_last_touch).toBe(2);
    // Active deals only — the lost deal is excluded.
    expect(p.active_deal_count).toBe(1);
    expect(p.most_recent_activity).toMatch(/call: Discussed budget/);
    expect(result.summary).toMatch(/Jane Doe/);
    expect(result.summary).toMatch(/hot 87/);
  });

  it('returns a shortlist (≤8) when multiple rows match', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `c_${i}`,
      name: `Person ${i}`,
      email: null,
      phone: null,
      leadScore: null,
      scoreLabel: null,
      type: 'QUALIFICATION',
      followUpAt: null,
      lastContactedAt: null,
      snoozedUntil: null,
    }));
    mockByTable = {
      Contact: { rows },
      ContactActivity: { rows: [] },
      DealContact: { rows: [] },
    };

    const result = await findPersonTool.handler({ query: 'Person', limit: 8 }, makeCtx());
    const data = result.data as { match: string; people?: unknown[] };
    expect(data.match).toBe('shortlist');
    expect(data.people).toHaveLength(3);
    expect(result.summary).toMatch(/Found 3 people/);
  });
});

// ── find_deal ──────────────────────────────────────────────────────────────

describe('findDealTool', () => {
  it('is auto-run (no approval)', () => {
    expect(findDealTool.requiresApproval).toBe(false);
  });

  it('returns match=none with a clear summary when nothing matches', async () => {
    mockByTable = { Deal: { rows: [] } };
    const result = await findDealTool.handler({ query: 'nonexistent', limit: 8 }, makeCtx());
    expect(result.summary).toMatch(/No deals/i);
    expect((result.data as { match: string }).match).toBe('none');
  });

  it('returns a single rich payload when only one deal matches', async () => {
    mockByTable = {
      Deal: {
        rows: [
          {
            id: 'd_1',
            title: '123 Main St',
            address: '123 Main St',
            value: 450_000,
            status: 'active',
            stageId: 'stage_a',
            closeDate: '2026-06-15T00:00:00.000Z',
            updatedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
            stageChangedAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
          },
        ],
      },
      DealStage: { rows: [{ id: 'stage_a', name: 'Under Contract' }] },
      DealContact: { rows: [{ Contact: { id: 'c_1', name: 'Jane Doe' } }] },
    };

    const result = await findDealTool.handler({ query: '123 Main', limit: 8 }, makeCtx());
    expect(result.display).toBe('deals');
    const data = result.data as {
      match: string;
      deal?: {
        id: string;
        title: string;
        value: number | null;
        stageId: string;
        stageName: string | null;
        status: string;
        daysInStage: number | null;
        daysSinceUpdate: number | null;
        contact_name: string | null;
        property_address: string | null;
        close_date: string | null;
      };
    };
    expect(data.match).toBe('single');
    const d = data.deal!;
    expect(d.id).toBe('d_1');
    expect(d.title).toBe('123 Main St');
    expect(d.value).toBe(450_000);
    expect(d.stageName).toBe('Under Contract');
    expect(d.status).toBe('active');
    // daysInStage is null until migration 20260526000000 (adds Deal.stageChangedAt)
    // ships in prod. The tool stops selecting the column to avoid crashing
    // on workspaces that haven't run the migration yet.
    expect(d.daysInStage).toBeNull();
    expect(d.daysSinceUpdate).toBe(3);
    expect(d.contact_name).toBe('Jane Doe');
    expect(d.property_address).toBe('123 Main St');
    expect(d.close_date).toBe('2026-06-15T00:00:00.000Z');
  });

  it('returns a shortlist when multiple deals match', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `d_${i}`,
      title: `Deal ${i}`,
      address: null,
      value: null,
      status: 'active',
      stageId: 'stage_a',
      closeDate: null,
      updatedAt: new Date().toISOString(),
      stageChangedAt: null,
    }));
    mockByTable = {
      Deal: { rows },
      DealStage: { rows: [{ id: 'stage_a', name: 'Active' }] },
      DealContact: { rows: [] },
    };
    const result = await findDealTool.handler({ query: 'Deal', limit: 8 }, makeCtx());
    const data = result.data as { match: string; deals?: unknown[] };
    expect(data.match).toBe('shortlist');
    expect(data.deals).toHaveLength(3);
    expect(result.summary).toMatch(/Found 3 deals/);
  });
});
