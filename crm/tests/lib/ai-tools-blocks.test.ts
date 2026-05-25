import { describe, it, expect } from 'vitest';
import {
  blocksFromLegacyContent,
  coalesceTextBlocks,
  type MessageBlock,
} from '@/lib/ai-tools/blocks';

describe('blocksFromLegacyContent', () => {
  it('wraps a string into a single text block', () => {
    expect(blocksFromLegacyContent('hi')).toEqual([{ type: 'text', content: 'hi' }]);
  });

  it('preserves empty strings (legacy rows with NULL content still render as an empty block)', () => {
    expect(blocksFromLegacyContent('')).toEqual([{ type: 'text', content: '' }]);
  });
});

describe('coalesceTextBlocks', () => {
  it('merges adjacent text blocks into one', () => {
    const input: MessageBlock[] = [
      { type: 'text', content: 'Hello ' },
      { type: 'text', content: 'world ' },
      { type: 'text', content: 'again.' },
    ];
    expect(coalesceTextBlocks(input)).toEqual([{ type: 'text', content: 'Hello world again.' }]);
  });

  it('keeps text blocks separated by tool calls distinct', () => {
    const input: MessageBlock[] = [
      { type: 'text', content: 'Let me search...' },
      {
        type: 'tool_call',
        callId: 'c1',
        name: 'search_contacts',
        args: {},
        status: 'complete',
        result: { ok: true, summary: 'Found 3.' },
      },
      { type: 'text', content: 'Here is what I found.' },
    ];
    expect(coalesceTextBlocks(input)).toHaveLength(3);
    expect(coalesceTextBlocks(input)[0]).toMatchObject({ type: 'text', content: 'Let me search...' });
  });

  it('is a no-op when no adjacent text blocks exist', () => {
    const input: MessageBlock[] = [
      {
        type: 'tool_call',
        callId: 'c1',
        name: 'search_contacts',
        args: {},
        status: 'complete',
      },
      {
        type: 'tool_call',
        callId: 'c2',
        name: 'search_deals',
        args: {},
        status: 'complete',
      },
    ];
    expect(coalesceTextBlocks(input)).toEqual(input);
  });

  it('handles empty input', () => {
    expect(coalesceTextBlocks([])).toEqual([]);
  });
});
