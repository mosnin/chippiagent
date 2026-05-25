import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MessageBlock } from '@/lib/ai-tools/blocks';

// ── Mock supabase: record every insert so tests can assert on the row ────
let inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
let nextError: { message: string } | null = null;

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return Promise.resolve({ data: null, error: nextError });
      },
    }),
  },
}));

import { saveAssistantMessage, saveUserMessage } from '@/lib/ai-tools/persistence';

beforeEach(() => {
  inserts = [];
  nextError = null;
});

describe('saveUserMessage', () => {
  it('inserts a Message row with role=user and no blocks', async () => {
    await saveUserMessage({ spaceId: 'space_1', conversationId: 'conv_1', content: 'Hi' });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe('Message');
    expect(inserts[0].row).toMatchObject({
      spaceId: 'space_1',
      conversationId: 'conv_1',
      role: 'user',
      content: 'Hi',
    });
    expect(inserts[0].row.blocks).toBeUndefined();
  });

  it('throws with a helpful error when the insert fails', async () => {
    nextError = { message: 'network down' };
    await expect(
      saveUserMessage({ spaceId: 's', conversationId: null, content: 'Hi' }),
    ).rejects.toThrow(/network down/);
  });
});

describe('saveAssistantMessage', () => {
  it('coalesces adjacent text blocks before persistence', async () => {
    const blocks: MessageBlock[] = [
      { type: 'text', content: 'Found ' },
      { type: 'text', content: '3 contacts.' },
    ];
    await saveAssistantMessage({ spaceId: 's', conversationId: 'c', blocks });
    const row = inserts[0].row;
    expect((row.blocks as MessageBlock[])).toHaveLength(1);
    expect((row.blocks as MessageBlock[])[0]).toMatchObject({
      type: 'text',
      content: 'Found 3 contacts.',
    });
  });

  it('derives content as the concatenation of text-block contents', async () => {
    const blocks: MessageBlock[] = [
      { type: 'text', content: 'Searching...' },
      {
        type: 'tool_call',
        callId: 'c1',
        name: 'search_contacts',
        args: {},
        status: 'complete',
      },
      { type: 'text', content: 'Found 3.' },
    ];
    await saveAssistantMessage({ spaceId: 's', conversationId: null, blocks });
    const row = inserts[0].row;
    // Concatenated text, tool_call block skipped for content derivation.
    expect(row.content).toMatch(/Searching/);
    expect(row.content).toMatch(/Found 3/);
    // Blocks array persists the tool_call as well.
    expect((row.blocks as MessageBlock[]).some((b) => b.type === 'tool_call')).toBe(true);
  });

  it('falls back to a placeholder content when the turn is tool-only', async () => {
    const blocks: MessageBlock[] = [
      {
        type: 'tool_call',
        callId: 'c1',
        name: 'search_contacts',
        args: {},
        status: 'complete',
      },
    ];
    await saveAssistantMessage({ spaceId: 's', conversationId: null, blocks });
    expect(inserts[0].row.content).toBe('(tool-only turn)');
  });

  it('returns the new message id', async () => {
    const { messageId } = await saveAssistantMessage({
      spaceId: 's',
      conversationId: null,
      blocks: [{ type: 'text', content: 'hi' }],
    });
    expect(typeof messageId).toBe('string');
    expect(messageId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('throws on supabase error', async () => {
    nextError = { message: 'db offline' };
    await expect(
      saveAssistantMessage({ spaceId: 's', conversationId: null, blocks: [{ type: 'text', content: 'hi' }] }),
    ).rejects.toThrow(/db offline/);
  });
});
