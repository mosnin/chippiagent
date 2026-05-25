/**
 * Phase 5 tool catalog — happy-path + basic failure coverage for each of
 * the six new mutating tools. Each tool owns a describe block; the shared
 * supabase mock below covers the chainable query shapes we use
 * (select/eq/is/in/order/limit/maybeSingle/single + insert + update).
 *
 * For scenarios that need different rows per table-visit (e.g.,
 * move_deal_stage fetches Deal then NewStage then OldStage), wire the
 * mock via `mockByTable[tableName]` — the mock returns the same shape for
 * every touch of the same table, which is fine for single-path tests.
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

const { sendSMSMock } = vi.hoisted(() => ({ sendSMSMock: vi.fn(async () => true) }));
vi.mock('@/lib/sms', () => ({ sendSMS: sendSMSMock }));

const { notifyNewDealMock } = vi.hoisted(() => ({ notifyNewDealMock: vi.fn(async () => undefined) }));
vi.mock('@/lib/notify', () => ({ notifyNewDeal: notifyNewDealMock }));

import { moveDealStageTool } from '@/lib/ai-tools/tools/move-deal-stage';
import { scheduleTourTool } from '@/lib/ai-tools/tools/schedule-tour';
import { addChecklistItemTool } from '@/lib/ai-tools/tools/add-checklist-item';
import { sendSmsTool } from '@/lib/ai-tools/tools/send-sms';
import { createDealTool } from '@/lib/ai-tools/tools/create-deal';
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
  sendSMSMock.mockClear();
  sendSMSMock.mockResolvedValue(true);
  notifyNewDealMock.mockClear();
});

// ── move_deal_stage ──────────────────────────────────────────────────────
describe('moveDealStageTool', () => {
  it('requires approval', () => {
    expect(moveDealStageTool.requiresApproval).toBe(true);
  });

  it('no-ops when the deal is already in the target stage', async () => {
    mockByTable = {
      Deal: { single: { id: 'd_1', title: 'Test', stageId: 'stage_a', status: 'active' } },
    };
    const result = await moveDealStageTool.handler(
      { dealId: 'd_1', stageId: 'stage_a' },
      makeCtx(),
    );
    expect(result.display).toBe('plain');
    expect(result.summary).toMatch(/already in/);
    expect(syncDealMock).not.toHaveBeenCalled();
  });

  it('errors when the deal is missing', async () => {
    mockByTable = { Deal: { single: null } };
    const result = await moveDealStageTool.handler(
      { dealId: 'missing', stageId: 'stage_b' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No deal/);
  });
});

// ── schedule_tour ────────────────────────────────────────────────────────
describe('scheduleTourTool', () => {
  it('requires approval', () => {
    expect(scheduleTourTool.requiresApproval).toBe(true);
  });

  it('rejects a schema with no invitee (neither contactId nor guest fields)', () => {
    expect(() =>
      scheduleTourTool.parameters.parse({
        startsAt: '2026-05-01T14:00:00.000Z',
        endsAt: '2026-05-01T15:00:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects when endsAt is not after startsAt', () => {
    expect(() =>
      scheduleTourTool.parameters.parse({
        guestName: 'A',
        guestEmail: 'a@b.com',
        startsAt: '2026-05-01T15:00:00.000Z',
        endsAt: '2026-05-01T15:00:00.000Z',
      }),
    ).toThrow();
  });

  it('creates a tour for a walk-in guest', async () => {
    mockByTable = {
      Tour: {
        single: {
          id: 'tour_1',
          startsAt: '2026-05-01T14:00:00.000Z',
          endsAt: '2026-05-01T15:00:00.000Z',
        },
      },
    };
    const result = await scheduleTourTool.handler(
      {
        guestName: 'Walk-in',
        guestEmail: 'walk@in.com',
        startsAt: '2026-05-01T14:00:00.000Z',
        endsAt: '2026-05-01T15:00:00.000Z',
        propertyAddress: '123 Main',
      },
      makeCtx(),
    );
    expect(result.display).toBe('tours');
    expect(result.summary).toMatch(/Tour scheduled/);
    const tours = (result.data as { tours: { contactId: string | null }[] }).tours;
    expect(tours).toHaveLength(1);
    expect(tours[0].contactId).toBeNull();
  });
});

// ── add_checklist_item ───────────────────────────────────────────────────
describe('addChecklistItemTool', () => {
  it('requires approval', () => {
    expect(addChecklistItemTool.requiresApproval).toBe(true);
  });

  it('rejects an empty label', () => {
    expect(() =>
      addChecklistItemTool.parameters.parse({ dealId: 'd_1', kind: 'custom', label: '' }),
    ).toThrow();
  });

  it('appends an item and echoes the label in the summary', async () => {
    mockByTable = {
      Deal: { single: { id: 'd_1', title: 'Test Deal' } },
      DealChecklistItem: {
        single: { id: 'item_1', dealId: 'd_1', kind: 'inspection', label: 'Book inspector', dueAt: null },
      },
    };
    const result = await addChecklistItemTool.handler(
      { dealId: 'd_1', kind: 'inspection', label: 'Book inspector' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(result.summary).toMatch(/Book inspector/);
    expect(result.summary).toMatch(/Test Deal/);
  });

  it('errors when the deal is missing from this space', async () => {
    mockByTable = { Deal: { single: null } };
    const result = await addChecklistItemTool.handler(
      { dealId: 'missing', kind: 'custom', label: 'anything' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No deal/);
  });
});

// ── send_sms ─────────────────────────────────────────────────────────────
describe('sendSmsTool', () => {
  it('requires approval', () => {
    expect(sendSmsTool.requiresApproval).toBe(true);
  });

  it('rejects when neither contactId nor toPhone is present', () => {
    expect(() => sendSmsTool.parameters.parse({ body: 'hi' })).toThrow();
  });

  it('sends to a contact\'s phone on file', async () => {
    mockByTable = {
      Contact: { single: { id: 'c_1', name: 'Jane', phone: '+14155550123' } },
    };
    const result = await sendSmsTool.handler(
      { contactId: 'c_1', body: 'Quick check — still on for Friday?' },
      makeCtx(),
    );
    expect(sendSMSMock).toHaveBeenCalledTimes(1);
    expect((sendSMSMock.mock.calls as unknown[][])[0][0]).toMatchObject({ to: '+14155550123' });
    expect(result.display).toBe('success');
    expect((result.data as { contactId: string | null }).contactId).toBe('c_1');
  });

  it('refuses to send when the contact has no phone', async () => {
    mockByTable = {
      Contact: { single: { id: 'c_2', name: 'Phoneless', phone: null } },
    };
    const result = await sendSmsTool.handler(
      { contactId: 'c_2', body: 'hi' },
      makeCtx(),
    );
    expect(sendSMSMock).not.toHaveBeenCalled();
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/no phone/);
  });

  it('reports a delivery failure when sendSMS returns false', async () => {
    mockByTable = { Contact: { single: null } };
    sendSMSMock.mockResolvedValueOnce(false);
    const result = await sendSmsTool.handler(
      { toPhone: '+14155550000', body: 'hi' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/SMS send failed/);
  });
});

// ── create_deal ──────────────────────────────────────────────────────────
describe('createDealTool', () => {
  it('requires approval', () => {
    expect(createDealTool.requiresApproval).toBe(true);
  });

  it('rejects a missing title', () => {
    expect(() => createDealTool.parameters.parse({ stageId: 's_1' })).toThrow();
  });

  it('creates a deal in a stage, reindexes, and fires the notification', async () => {
    mockByTable = {
      DealStage: { single: { id: 'stage_1', name: 'Prospects', pipelineType: 'buyer' } },
      Deal: {
        single: {
          id: 'deal_1',
          spaceId: 'space_1',
          title: 'Parkside listing',
          stageId: 'stage_1',
          priority: 'MEDIUM',
          position: 0,
        },
      },
    };
    const result = await createDealTool.handler(
      {
        title: 'Parkside listing',
        stageId: 'stage_1',
        value: 850000,
        priority: 'HIGH',
      },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(result.summary).toMatch(/Parkside listing/);
    expect(result.summary).toMatch(/Prospects/);
    expect(syncDealMock).toHaveBeenCalledTimes(1);
    expect(notifyNewDealMock).toHaveBeenCalledTimes(1);
  });

  it('errors when the workspace has no pipeline stages at all', async () => {
    // create_deal now falls back to a default stage when the passed stageId
    // doesn't match. The genuine error case is "workspace has no stages
    // configured anywhere" — no buyer pipeline, no seller pipeline, nothing.
    mockByTable = { DealStage: { single: null } };
    const result = await createDealTool.handler(
      { title: 'X', stageId: 'bogus' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No pipeline stages/);
    expect(syncDealMock).not.toHaveBeenCalled();
  });
});
