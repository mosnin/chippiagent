/**
 * NEW_BUILD — the 5 chat-cutover tools that closed the gap doc:
 *   add_property, update_deal_probability, request_deal_review,
 *   send_property_packet, read_attachment.
 *
 * Two cases per tool: happy path + a representative failure mode.
 * Mock pattern mirrors phase14.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockByTable: Record<
  string,
  {
    rows?: Array<Record<string, unknown>>;
    error?: { message: string } | null;
    single?: Record<string, unknown> | null;
  }
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

import { addPropertyTool } from '@/lib/ai-tools/tools/add-property';
import { updateDealProbabilityTool } from '@/lib/ai-tools/tools/update-deal-probability';
import { requestDealReviewTool } from '@/lib/ai-tools/tools/request-deal-review';
import { sendPropertyPacketTool } from '@/lib/ai-tools/tools/send-property-packet';
import { readAttachmentTool } from '@/lib/ai-tools/tools/read-attachment';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'user_1',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u_owner' },
    signal: new AbortController().signal,
  };
}

beforeEach(() => {
  mockByTable = {};
});

// ── add_property ─────────────────────────────────────────────────────────
describe('addPropertyTool', () => {
  it('requires approval', () => {
    expect(addPropertyTool.requiresApproval).toBe(true);
  });

  it('summariseCall mentions the address', () => {
    const out = addPropertyTool.summariseCall!({ address: '412 Elm St' } as never);
    expect(out).toMatch(/412 Elm St/);
  });

  it('inserts with defaults and echoes the address', async () => {
    mockByTable = { Property: { rows: [], error: null } };
    const result = await addPropertyTool.handler(
      { address: '412 Elm St', listPrice: 850_000 },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(result.summary).toMatch(/412 Elm St/);
    const data = result.data as { listingStatus: string };
    expect(data.listingStatus).toBe('active');
  });

  it('returns error when Property insert fails', async () => {
    mockByTable = { Property: { error: { message: 'unique violation' } } };
    const result = await addPropertyTool.handler(
      { address: '412 Elm St' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/unique violation/);
  });
});

// ── update_deal_probability ──────────────────────────────────────────────
describe('updateDealProbabilityTool', () => {
  it('requires approval', () => {
    expect(updateDealProbabilityTool.requiresApproval).toBe(true);
  });

  it('summariseCall is domain-specific (mentions percentage)', () => {
    const out = updateDealProbabilityTool.summariseCall!({
      dealId: 'd_abcd1234',
      probability: 70,
    } as never);
    expect(out).toMatch(/70%/);
  });

  it('updates probability and acks the deal title', async () => {
    mockByTable = {
      Deal: { single: { id: 'd_1', title: 'Parkside listing', probability: 50 } },
    };
    const result = await updateDealProbabilityTool.handler(
      { dealId: 'd_1', probability: 70, why: 'Inspection clean' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(result.summary).toMatch(/Parkside listing/);
    expect(result.summary).toMatch(/70%/);
  });

  it('errors when the deal is missing', async () => {
    mockByTable = { Deal: { single: null } };
    const result = await updateDealProbabilityTool.handler(
      { dealId: 'missing', probability: 50 },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No deal/);
  });

  it('rejects a probability outside 0-100 at parse time', () => {
    expect(() =>
      updateDealProbabilityTool.parameters.parse({ dealId: 'd_1', probability: 150 }),
    ).toThrow();
  });
});

// ── request_deal_review ──────────────────────────────────────────────────
describe('requestDealReviewTool', () => {
  it('requires approval', () => {
    expect(requestDealReviewTool.requiresApproval).toBe(true);
  });

  it('rejects too-short reasons at parse time', () => {
    expect(() =>
      requestDealReviewTool.parameters.parse({ dealId: 'd_1', reason: 'short' }),
    ).toThrow();
  });

  it('refuses when the workspace has no brokerage', async () => {
    mockByTable = {
      Deal: { single: { id: 'd_1', title: 'Big deal' } },
      Space: { single: { id: 'space_1', ownerId: 'u_owner', brokerageId: null } },
    };
    const result = await requestDealReviewTool.handler(
      { dealId: 'd_1', reason: 'Unusual commission split needs sign-off' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/solo workspace/);
  });
});

// ── send_property_packet ─────────────────────────────────────────────────
describe('sendPropertyPacketTool', () => {
  it('requires approval', () => {
    expect(sendPropertyPacketTool.requiresApproval).toBe(true);
  });

  it('summariseCall mentions both halves of the action', () => {
    const out = sendPropertyPacketTool.summariseCall!({
      contactId: 'c_abcd1234',
      propertyId: 'p_wxyz5678',
    } as never);
    expect(out.toLowerCase()).toContain('packet');
  });

  it('errors when the contact is missing', async () => {
    mockByTable = { Contact: { single: null } };
    const result = await sendPropertyPacketTool.handler(
      { contactId: 'missing', propertyId: 'p_1' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No contact/);
  });
});

// ── read_attachment ──────────────────────────────────────────────────────
describe('readAttachmentTool', () => {
  it('is read-only', () => {
    expect(readAttachmentTool.requiresApproval).toBe(false);
  });

  it('returns metadata without leaking blob content', async () => {
    mockByTable = {
      Attachment: {
        single: {
          id: 'a_1',
          filename: 'disclosure.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 250_000,
          extractionStatus: 'done',
          extractedText: 'Property disclosure for 412 Elm St.\nLine two.',
        },
      },
    };
    const result = await readAttachmentTool.handler({ attachmentId: 'a_1' }, makeCtx());
    expect(result.display).toBe('plain');
    expect(result.summary).toMatch(/disclosure\.pdf/);
    const data = result.data as {
      filename: string;
      mimeType: string;
      hasExtractedText: boolean;
      description: string | null;
    };
    expect(data.filename).toBe('disclosure.pdf');
    expect(data.mimeType).toBe('application/pdf');
    expect(data.hasExtractedText).toBe(true);
    // Description is the FIRST line only — never the full body.
    expect(data.description).toMatch(/Property disclosure/);
    expect(data.description).not.toMatch(/Line two/);
  });

  it('errors when the attachment is missing in this workspace', async () => {
    mockByTable = { Attachment: { single: null } };
    const result = await readAttachmentTool.handler({ attachmentId: 'missing' }, makeCtx());
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No attachment/);
  });
});
