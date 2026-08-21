import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const fireAgentTrigger = vi.fn(async () => ({ queued: true, firedImmediately: true }));

let dealRow: {
  id: string;
  spaceId: string;
  stageId: string;
  position: number;
};
let stageRow: { id: string; spaceId: string };
let rpcError: { message: string } | null = null;

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'u_1' })),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(async () => ({ id: 'space_1' })),
}));

vi.mock('@/lib/agent/fire-trigger', () => ({ fireAgentTrigger }));

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    const pass = () => chain;
    chain.select = vi.fn(pass);
    chain.eq = vi.fn(pass);
    chain.maybeSingle = vi.fn(async () => {
      if (table === 'Deal') return { data: dealRow, error: null };
      if (table === 'DealStage') return { data: stageRow, error: null };
      return { data: null, error: null };
    });
    chain.single = vi.fn(async () => ({
      data: { ...dealRow, stageId: stageRow.id },
      error: null,
    }));
    return chain;
  }
  return {
    supabase: {
      from: vi.fn((table: string) => makeChain(table)),
      rpc: vi.fn(async () => ({ error: rpcError })),
    },
  };
});

const REORDER_ROUTE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../app/api/deals/reorder/route.ts'),
  'utf8',
);
const DEAL_PATCH_ROUTE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../app/api/deals/[id]/route.ts'),
  'utf8',
);

async function callReorder(body: Record<string, unknown>) {
  const { PATCH } = await import('@/app/api/deals/reorder/route');
  const req = new Request('http://localhost/api/deals/reorder', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await PATCH(req as never);
  return { res, body: await res.json() };
}

describe('deal stage change wakes the agent', () => {
  it('PATCH /api/deals/[id] fires deal_stage_changed on stage change', () => {
    expect(DEAL_PATCH_ROUTE).toMatch(/fireAgentTrigger/);
    expect(DEAL_PATCH_ROUTE).toMatch(/event:\s*'deal_stage_changed'/);
    expect(DEAL_PATCH_ROUTE).toMatch(/if \(stageChanged\)/);
  });

  it('PATCH /api/deals/reorder fires deal_stage_changed on a real stage move', () => {
    expect(REORDER_ROUTE).toMatch(/fireAgentTrigger/);
    expect(REORDER_ROUTE).toMatch(/event:\s*'deal_stage_changed'/);
    expect(REORDER_ROUTE).toMatch(/deal\.stageId !== newStageId/);
  });
});

describe('PATCH /api/deals/reorder agent trigger', () => {
  beforeEach(() => {
    fireAgentTrigger.mockClear();
    fireAgentTrigger.mockResolvedValue({ queued: true, firedImmediately: true });
    rpcError = null;
    dealRow = { id: 'deal_1', spaceId: 'space_1', stageId: 'stage_old', position: 0 };
    stageRow = { id: 'stage_new', spaceId: 'space_1' };
  });

  it('fires deal_stage_changed when the deal actually changes stage', async () => {
    const out = await callReorder({
      dealId: 'deal_1',
      newStageId: 'stage_new',
      newPosition: 0,
    });

    expect(out.res.status).toBe(200);
    expect(fireAgentTrigger).toHaveBeenCalledTimes(1);
    expect(fireAgentTrigger).toHaveBeenCalledWith({
      spaceId: 'space_1',
      event: 'deal_stage_changed',
      dealId: 'deal_1',
    });
  });

  it('does not fire on same-column position reorder', async () => {
    stageRow = { id: 'stage_old', spaceId: 'space_1' };

    const out = await callReorder({
      dealId: 'deal_1',
      newStageId: 'stage_old',
      newPosition: 2,
    });

    expect(out.res.status).toBe(200);
    expect(fireAgentTrigger).not.toHaveBeenCalled();
  });

  it('does not fail the reorder when the trigger throws', async () => {
    fireAgentTrigger.mockRejectedValueOnce(new Error('redis down'));

    const out = await callReorder({
      dealId: 'deal_1',
      newStageId: 'stage_new',
      newPosition: 0,
    });

    expect(out.res.status).toBe(200);
    expect(out.body.id).toBe('deal_1');
  });
});
