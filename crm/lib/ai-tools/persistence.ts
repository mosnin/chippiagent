/**
 * Message persistence for the on-demand agent.
 *
 * Two helpers — `saveUserMessage` and `saveAssistantMessage` — used by the
 * Phase 2 loop and the Phase 3 approval resumer. Saving is centralised
 * here so both:
 *   (a) use the same content-coalescing and content-derivation logic, and
 *   (b) write identical rows, avoiding "looks right on the first send but
 *       diverges on retry" bugs.
 *
 * The `Message` table has both `content` (legacy plain-text fallback) and
 * `blocks` (the rich transcript). Assistant messages populate both: blocks
 * for the new renderer, content as the concatenation of text blocks so
 * anything that reads `content` (old chat UI, export tools, RAG) sees
 * something sensible.
 */

import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { coalesceTextBlocks, type MessageBlock } from './blocks';

export interface SaveUserMessageInput {
  spaceId: string;
  conversationId: string | null;
  content: string;
}

export async function saveUserMessage(input: SaveUserMessageInput): Promise<{ messageId: string }> {
  const id = crypto.randomUUID();
  const { error } = await supabase.from('Message').insert({
    id,
    spaceId: input.spaceId,
    conversationId: input.conversationId,
    role: 'user',
    content: input.content,
    // User messages don't need blocks — they're always plain text.
  });
  if (error) {
    logger.error('[tools.persistence] saveUserMessage failed', { spaceId: input.spaceId }, error);
    throw new Error(`Failed to save user message: ${error.message}`);
  }
  return { messageId: id };
}

export interface SaveAssistantMessageInput {
  spaceId: string;
  conversationId: string | null;
  blocks: MessageBlock[];
}

/**
 * Save the assistant's blocks as a new Message row.
 *
 * - Coalesces adjacent text blocks (the loop typically emits many small
 *   text_delta events that accumulate into tiny blocks).
 * - Derives `content` as the concatenation of text-block contents so
 *   legacy readers still get something useful.
 * - Returns the new message id so the caller can reference it in its SSE
 *   `turn_complete` event if it wants to.
 */
export async function saveAssistantMessage(
  input: SaveAssistantMessageInput,
): Promise<{ messageId: string }> {
  const merged = coalesceTextBlocks(input.blocks);
  const content = merged
    .filter((b): b is Extract<MessageBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.content)
    .join('\n')
    .trim();

  const id = crypto.randomUUID();
  const { error } = await supabase.from('Message').insert({
    id,
    spaceId: input.spaceId,
    conversationId: input.conversationId,
    role: 'assistant',
    // Content is required-NOT-NULL in the legacy schema; at minimum we
    // store something. An empty-text assistant message (pure tool calls)
    // falls back to a short placeholder so legacy readers don't render a
    // blank row.
    content: content || '(tool-only turn)',
    blocks: merged as unknown as Record<string, unknown>[],
  });
  if (error) {
    logger.error('[tools.persistence] saveAssistantMessage failed', { spaceId: input.spaceId }, error);
    throw new Error(`Failed to save assistant message: ${error.message}`);
  }
  return { messageId: id };
}
