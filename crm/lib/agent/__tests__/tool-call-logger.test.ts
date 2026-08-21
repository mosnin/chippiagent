import { describe, it, expect, vi, beforeEach } from 'vitest';

const eqIds: string[][] = [];

vi.mock('@/lib/supabase', () => {
  const updateChain = {
    eq: vi.fn((column: string, value: string) => {
      const current = eqIds[eqIds.length - 1];
      if (current) {
        if (column === 'id') current[0] = value;
        if (column === 'spaceId') current[1] = value;
      }
      return updateChain;
    }),
  };
  return {
    supabase: {
      from: vi.fn(() => ({
        insert: vi.fn(async () => ({ data: null, error: null })),
        update: vi.fn(() => {
          eqIds.push([]);
          return updateChain;
        }),
      })),
    },
  };
});

import { logToolCallStart, logToolCallComplete, logToolCallError } from '../tool-call-logger';

beforeEach(() => {
  eqIds.length = 0;
  vi.clearAllMocks();
});

describe('tool-call-logger tenant scope', () => {
  it('scopes complete and error writes to the space that started the call', async () => {
    const stepId = await logToolCallStart('space-a', 'send_sms', { to: '+15555550123' });
    await logToolCallComplete(stepId, 'sent');
    expect(eqIds[0]).toEqual([stepId, 'space-a']);

    const failedId = await logToolCallStart('space-b', 'send_sms', { to: '+15555550124' });
    await logToolCallError(failedId, 'Telnyx down');
    expect(eqIds[1]).toEqual([failedId, 'space-b']);
  });
});
