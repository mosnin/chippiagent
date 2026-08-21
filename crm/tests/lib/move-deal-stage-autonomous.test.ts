import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fireAgentTrigger, sendSMS } = vi.hoisted(() => ({
  fireAgentTrigger: vi.fn(async () => ({ queued: true })),
  sendSMS: vi.fn(async () => true),
}));

let mockByTable: Record<
  string,
  { rows?: Array<Record<string, unknown>>; single?: Record<string, unknown> | null }
> = {};

vi.mock('@/lib/agent/fire-trigger', () => ({ fireAgentTrigger }));
vi.mock('@/lib/sms', () => ({ sendSMS }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/vectorize', () => ({
  syncDeal: vi.fn(async () => undefined),
  syncContact: vi.fn(),
  deleteDealVector: vi.fn(),
}));

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const override = mockByTable[table] ?? {};
    const rows = override.rows ?? (override.single ? [override.single] : []);
    const chain: Record<string, unknown> = {};
    const pass = () => chain;
    chain.select = vi.fn(pass);
    chain.eq = vi.fn(pass);
    chain.in = vi.fn(pass);
    chain.update = vi.fn(pass);
    chain.insert = vi.fn(pass);
    chain.maybeSingle = vi.fn(async () => ({ data: override.single ?? rows[0] ?? null, error: null }));
    chain.single = vi.fn(async () => ({ data: override.single ?? rows[0] ?? null, error: null }));
    chain.then = (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import {
  composeDealStageChangedSms,
  fireAndSendDealStageChanged,
  moveDealStageTool,
} from '@/lib/ai-tools/tools/move-deal-stage';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'user_1',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u1' },
    signal: new AbortController().signal,
  };
}

describe('move_deal_stage autonomous fire + send', () => {
  beforeEach(() => {
    mockByTable = {};
    fireAgentTrigger.mockClear();
    sendSMS.mockClear();
    sendSMS.mockResolvedValue(true);
  });

  it('does not require approval', () => {
    expect(moveDealStageTool.requiresApproval).toBe(false);
  });

  it('fires deal_stage_changed and sends after a real stage move', async () => {
    mockByTable = {
      Deal: {
        single: { id: 'd_1', title: '1422 Pine', stageId: 'stage_a', status: 'active' },
        rows: [{ id: 'd_1', title: '1422 Pine', stageId: 'stage_b', status: 'active' }],
      },
      DealStage: { single: { id: 'stage_b', name: 'Under Contract' } },
      DealContact: { rows: [{ contactId: 'c1' }] },
      Contact: { rows: [{ id: 'c1', name: 'Sam Rivera', phone: '+15551212' }] },
      AIUserProfile: { single: { displayName: 'Jordan Lee' } },
      DealActivity: { rows: [] },
    };

    const result = await moveDealStageTool.handler(
      { dealId: 'd_1', stageId: 'stage_b' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(fireAgentTrigger).toHaveBeenCalledWith({
      spaceId: 'space_1',
      event: 'deal_stage_changed',
      dealId: 'd_1',
      contactId: undefined,
    });
    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(sendSMS.mock.calls[0][0].to).toBe('+15551212');
    expect(sendSMS.mock.calls[0][0].body).toMatch(/Sam/);
    expect(sendSMS.mock.calls[0][0].body).toMatch(/Jordan/);
    expect(sendSMS.mock.calls[0][0].body).toMatch(/Under Contract/);
    expect(sendSMS.mock.calls[0][0].body).not.toMatch(/chippy/i);
  });

  it('does not fire or send when the deal is already in that stage', async () => {
    mockByTable = {
      Deal: { single: { id: 'd_1', title: 'Test', stageId: 'stage_a', status: 'active' } },
    };
    const result = await moveDealStageTool.handler(
      { dealId: 'd_1', stageId: 'stage_a' },
      makeCtx(),
    );
    expect(result.display).toBe('plain');
    expect(fireAgentTrigger).not.toHaveBeenCalled();
    expect(sendSMS).not.toHaveBeenCalled();
  });
});

describe('fireAndSendDealStageChanged', () => {
  beforeEach(() => {
    mockByTable = {};
    fireAgentTrigger.mockClear();
    sendSMS.mockClear();
    sendSMS.mockResolvedValue(true);
  });

  it('fires then sends without creating a pending draft', async () => {
    mockByTable = {
      DealContact: { rows: [{ contactId: 'c1' }] },
      Contact: { rows: [{ id: 'c1', name: 'Sam', phone: '+15550000' }] },
      AIUserProfile: { single: { displayName: 'Jordan' } },
    };
    await fireAndSendDealStageChanged({
      spaceId: 's1',
      dealId: 'd1',
      stageName: 'Offer',
    });
    expect(fireAgentTrigger).toHaveBeenCalledWith({
      spaceId: 's1',
      event: 'deal_stage_changed',
      dealId: 'd1',
      contactId: undefined,
    });
    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(sendSMS.mock.calls[0][0].body).not.toMatch(/chippy/i);
  });
});

describe('composeDealStageChangedSms', () => {
  it('writes realtor voice and rejects Chippy', () => {
    const text = composeDealStageChangedSms('Sam Rivera', 'Offer', 'Jordan Lee');
    expect(text).toContain('Sam');
    expect(text).toContain('Jordan');
    expect(text).toContain('Offer');
    expect(text).not.toMatch(/chippy/i);
    expect(text).not.toMatch(/\b(sent|booked|reserved|locked)\b/i);
  });
});
