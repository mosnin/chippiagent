/**
 * Phase 15 (Phase B) tool catalog — happy + sad path coverage for the 10
 * deal/tour/property tools. Mock pattern mirrors phase5: a `mockByTable`
 * dictionary maps table name → either {single} or {rows} so chained query
 * shapes resolve to the right data on each .from('Table') call.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    const count = override?.count ?? rows.length;

    const termThen = Promise.resolve({ data: rows, error, count });
    const singleThen = Promise.resolve({ data: single ?? rows[0] ?? null, error });

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    chain.select = vi.fn(passthrough);
    chain.eq = vi.fn(passthrough);
    chain.is = vi.fn(passthrough);
    chain.in = vi.fn(passthrough);
    chain.neq = vi.fn(passthrough);
    chain.gte = vi.fn(passthrough);
    chain.lte = vi.fn(passthrough);
    chain.or = vi.fn(passthrough);
    chain.not = vi.fn(passthrough);
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

const { syncContactMock, syncDealMock, deleteContactVectorMock } = vi.hoisted(() => ({
  syncContactMock: vi.fn(async () => undefined),
  syncDealMock: vi.fn(async () => undefined),
  deleteContactVectorMock: vi.fn(async () => undefined),
}));
vi.mock('@/lib/vectorize', () => ({
  syncContact: syncContactMock,
  syncDeal: syncDealMock,
  deleteContactVector: deleteContactVectorMock,
  deleteDealVector: vi.fn(),
}));

import { updateDealValueTool } from '@/lib/ai-tools/tools/update-deal-value';
import { updateDealCloseDateTool, resolveCloseDate } from '@/lib/ai-tools/tools/update-deal-close-date';
import { attachPropertyToDealTool } from '@/lib/ai-tools/tools/attach-property-to-deal';
import { rescheduleTourTool } from '@/lib/ai-tools/tools/reschedule-tour';
import { cancelTourTool } from '@/lib/ai-tools/tools/cancel-tour';
import { findToursTool } from '@/lib/ai-tools/tools/find-tours';
import { updatePropertyStatusTool } from '@/lib/ai-tools/tools/update-property-status';
import { noteOnPropertyTool } from '@/lib/ai-tools/tools/note-on-property';
import { findPropertyTool } from '@/lib/ai-tools/tools/find-property';
import { mergePersonsTool } from '@/lib/ai-tools/tools/merge-persons';
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
  deleteContactVectorMock.mockClear();
});

// ── update_deal_value ────────────────────────────────────────────────────
describe('updateDealValueTool', () => {
  it('requires approval', () => {
    expect(updateDealValueTool.requiresApproval).toBe(true);
  });

  it('updates the value, logs activity, reindexes', async () => {
    mockByTable = {
      Deal: { single: { id: 'd_1', title: 'Parkside', value: 500_000 } },
    };
    const result = await updateDealValueTool.handler(
      { dealId: 'd_1', newValue: 550_000, why: 'New comps' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(result.summary).toMatch(/Parkside/);
    expect(result.summary).toMatch(/\$550,000/);
    expect(syncDealMock).toHaveBeenCalledTimes(1);
  });

  it('errors when deal is missing', async () => {
    mockByTable = { Deal: { single: null } };
    const result = await updateDealValueTool.handler(
      { dealId: 'missing', newValue: 100 },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No deal/);
    expect(syncDealMock).not.toHaveBeenCalled();
  });
});

// ── update_deal_close_date ───────────────────────────────────────────────
describe('updateDealCloseDateTool', () => {
  it('requires approval', () => {
    expect(updateDealCloseDateTool.requiresApproval).toBe(true);
  });

  it('resolves "tomorrow" to a valid ISO string', () => {
    const out = resolveCloseDate('tomorrow', new Date('2026-05-01T12:00:00Z'));
    expect(out).not.toBeNull();
    expect(out!.slice(0, 10)).toBe('2026-05-02');
  });

  it('resolves an explicit ISO datetime', () => {
    const out = resolveCloseDate('2026-07-15');
    expect(out).not.toBeNull();
    expect(out!.slice(0, 10)).toBe('2026-07-15');
  });

  it('errors on an unparseable phrase', async () => {
    mockByTable = { Deal: { single: { id: 'd_1', title: 'X', closeDate: null } } };
    const result = await updateDealCloseDateTool.handler(
      { dealId: 'd_1', when: 'sometime soonish' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/Couldn't read/);
  });

  it('updates closeDate when given a valid relative phrase', async () => {
    mockByTable = { Deal: { single: { id: 'd_1', title: 'Parkside', closeDate: null } } };
    const result = await updateDealCloseDateTool.handler(
      { dealId: 'd_1', when: 'in 2 weeks' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(result.summary).toMatch(/Parkside/);
  });
});

// ── attach_property_to_deal ──────────────────────────────────────────────
describe('attachPropertyToDealTool', () => {
  it('requires approval', () => {
    expect(attachPropertyToDealTool.requiresApproval).toBe(true);
  });

  it('errors when the property is in a different space (not found)', async () => {
    mockByTable = {
      Deal: { single: { id: 'd_1', title: 'X', propertyId: null } },
      Property: { single: null },
    };
    const result = await attachPropertyToDealTool.handler(
      { dealId: 'd_1', propertyId: 'p_other_space' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No property/);
  });
});

// ── reschedule_tour ──────────────────────────────────────────────────────
describe('rescheduleTourTool', () => {
  it('requires approval', () => {
    expect(rescheduleTourTool.requiresApproval).toBe(true);
  });

  it('errors when tour is missing', async () => {
    mockByTable = { Tour: { single: null } };
    const result = await rescheduleTourTool.handler(
      {
        tourId: 'missing',
        newStartsAt: '2026-06-01T15:00:00.000Z',
      },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No tour/);
  });

  it('reschedules and preserves duration when newEndsAt is omitted', async () => {
    mockByTable = {
      Tour: {
        single: {
          id: 't_1',
          startsAt: '2026-05-01T14:00:00.000Z',
          endsAt: '2026-05-01T15:00:00.000Z',
          contactId: null,
          propertyAddress: null,
          guestName: 'Sam',
          status: 'scheduled',
        },
      },
    };
    const result = await rescheduleTourTool.handler(
      { tourId: 't_1', newStartsAt: '2026-06-01T18:00:00.000Z' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    const data = result.data as { startsAt: string; endsAt: string };
    expect(new Date(data.endsAt).getTime() - new Date(data.startsAt).getTime()).toBe(60 * 60 * 1000);
  });
});

// ── cancel_tour ──────────────────────────────────────────────────────────
describe('cancelTourTool', () => {
  it('requires approval', () => {
    expect(cancelTourTool.requiresApproval).toBe(true);
  });

  it('errors when the tour is missing', async () => {
    mockByTable = { Tour: { single: null } };
    const result = await cancelTourTool.handler(
      { tourId: 'missing', reason: 'guest fell ill' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No tour/);
  });

  it('flips status to cancelled and acknowledges the guest', async () => {
    mockByTable = {
      Tour: {
        single: {
          id: 't_1',
          contactId: null,
          guestName: 'Sam',
          propertyAddress: '123 Main',
          status: 'scheduled',
        },
      },
    };
    const result = await cancelTourTool.handler(
      { tourId: 't_1', reason: 'guest fell ill' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(result.summary).toMatch(/Sam/);
    expect((result.data as { status: string }).status).toBe('cancelled');
  });
});

// ── find_tours ───────────────────────────────────────────────────────────
describe('findToursTool', () => {
  it('is read-only', () => {
    expect(findToursTool.requiresApproval).toBe(false);
  });

  it('returns an empty list cleanly', async () => {
    mockByTable = { Tour: { rows: [] } };
    const result = await findToursTool.handler({ status: 'scheduled' }, makeCtx());
    expect(result.summary).toMatch(/No tours/);
    expect((result.data as { tours: unknown[] }).tours).toHaveLength(0);
  });

  it('summarises a list of tours', async () => {
    mockByTable = {
      Tour: {
        rows: [
          {
            id: 't_1',
            startsAt: '2026-05-02T14:00:00.000Z',
            endsAt: '2026-05-02T15:00:00.000Z',
            propertyAddress: '123 Main',
            guestName: 'Sam',
            status: 'scheduled',
          },
          {
            id: 't_2',
            startsAt: '2026-05-03T14:00:00.000Z',
            endsAt: '2026-05-03T15:00:00.000Z',
            propertyAddress: '456 Oak',
            guestName: 'Jane',
            status: 'confirmed',
          },
        ],
      },
    };
    const result = await findToursTool.handler({}, makeCtx());
    expect(result.display).toBe('tours');
    expect((result.data as { tours: unknown[] }).tours).toHaveLength(2);
    expect(result.summary).toMatch(/Sam/);
    expect(result.summary).toMatch(/Jane/);
  });
});

// ── update_property_status ───────────────────────────────────────────────
describe('updatePropertyStatusTool', () => {
  it('requires approval', () => {
    expect(updatePropertyStatusTool.requiresApproval).toBe(true);
  });

  it('rejects an unknown status at parse time', () => {
    expect(() =>
      updatePropertyStatusTool.parameters.parse({ propertyId: 'p_1', newStatus: 'bogus' }),
    ).toThrow();
  });

  it('updates the status and echoes the address', async () => {
    mockByTable = {
      Property: { single: { id: 'p_1', address: '123 Main', listingStatus: 'active' } },
    };
    const result = await updatePropertyStatusTool.handler(
      { propertyId: 'p_1', newStatus: 'pending' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(result.summary).toMatch(/123 Main/);
    expect(result.summary).toMatch(/pending/);
  });
});

// ── note_on_property ─────────────────────────────────────────────────────
describe('noteOnPropertyTool', () => {
  it('requires approval', () => {
    expect(noteOnPropertyTool.requiresApproval).toBe(true);
  });

  it('errors when property is missing', async () => {
    mockByTable = { Property: { single: null } };
    const result = await noteOnPropertyTool.handler(
      { propertyId: 'missing', content: 'hello' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No property/);
  });

  it('appends a dated note line', async () => {
    mockByTable = {
      Property: { single: { id: 'p_1', address: '123 Main', notes: null } },
    };
    const result = await noteOnPropertyTool.handler(
      { propertyId: 'p_1', content: 'Sellers want a quick close' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    const line = (result.data as { appendedLine: string }).appendedLine;
    expect(line).toMatch(/^\[\d{4}-\d{2}-\d{2}\] Sellers want/);
  });
});

// ── find_property ────────────────────────────────────────────────────────
describe('findPropertyTool', () => {
  it('is read-only', () => {
    expect(findPropertyTool.requiresApproval).toBe(false);
  });

  it('rejects with no filters', () => {
    expect(() => findPropertyTool.parameters.parse({})).toThrow();
  });

  it('returns a single match richly', async () => {
    mockByTable = {
      Property: {
        single: null, // exact-id miss falls through to query
        rows: [
          {
            id: 'p_1',
            address: '123 Main',
            city: 'Brooklyn',
            listingStatus: 'active',
            mlsNumber: 'MLS123',
            listPrice: 750_000,
            beds: 3,
            baths: 2,
            squareFeet: 1500,
          },
        ],
      },
    };
    const result = await findPropertyTool.handler({ query: '123 Main' }, makeCtx());
    const data = result.data as { match: string; property?: { address: string } };
    expect(data.match).toBe('single');
    expect(data.property?.address).toBe('123 Main');
  });
});

// ── merge_persons ────────────────────────────────────────────────────────
describe('mergePersonsTool', () => {
  it('requires approval', () => {
    expect(mergePersonsTool.requiresApproval).toBe(true);
  });

  it('rejects keepId === mergeId at parse time', () => {
    expect(() => mergePersonsTool.parameters.parse({ keepId: 'a', mergeId: 'a' })).toThrow();
  });

  it('summariseCall makes the destruction explicit', () => {
    const text = mergePersonsTool.summariseCall!({ keepId: 'jane_chen_1234', mergeId: 'sam_chen_5678' });
    expect(text.toLowerCase()).toContain('delete');
    expect(text).toContain('keep');
  });

  it('errors when the keep contact is missing', async () => {
    // Both lookups go to 'Contact'; we can only return one shape, so the
    // shared mock returns null for both → keep lookup fails first.
    mockByTable = { Contact: { single: null } };
    const result = await mergePersonsTool.handler(
      { keepId: 'k_missing', mergeId: 'm_missing' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No contact/);
  });
});
