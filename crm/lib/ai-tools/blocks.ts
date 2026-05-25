/**
 * Message-level block types — the persisted form of what the user sees in
 * the transcript. Mirrors the SSE event protocol but flattened for storage:
 * by the time a message is saved, tool-call results have resolved and
 * permission prompts are either resolved or marked dormant.
 *
 * A message's `blocks` array is the ordered render list: the client walks
 * it top-to-bottom to reconstruct the transcript on page load. Legacy
 * messages with `blocks === null` render `content` as a single text block.
 */

import type { ToolResult } from './types';

export type MessageBlock = TextBlock | ToolCallBlock | PermissionBlock | ReasoningBlock;

export interface TextBlock {
  type: 'text';
  content: string;
}

export interface ToolCallBlock {
  type: 'tool_call';
  callId: string;
  name: string;
  args: Record<string, unknown>;
  /** Populated once the handler resolved (or errored). */
  result?: {
    ok: boolean;
    summary: string;
    data?: unknown;
    error?: string;
  };
  /**
   * Final persisted status. While the loop is live the UI tracks
   * 'running'; once saved, the block is one of the four below.
   */
  status: 'complete' | 'error' | 'denied' | 'skipped';
  /** Hint for the block renderer — carried through from ToolResult.display. */
  display?: ToolResult['display'];
}

/**
 * A permission-gated tool call the user saw but did not approve. Kept as a
 * block so the transcript history reflects what was asked — useful when
 * the user returns a day later and wants to remember why a message thread
 * ended without a send. Approved calls are persisted as ToolCallBlock
 * instead (the prompt was just the pre-execution form).
 */
export interface PermissionBlock {
  type: 'permission';
  callId: string;
  name: string;
  args: Record<string, unknown>;
  summary: string;
  decision: 'denied' | 'dismissed';
  display?: ToolResult['display'];
}

/**
 * The model's chain of thought for one assistant turn. Populated from
 * `reasoning_delta` events the SDK emits for reasoning-capable models
 * (gpt-5 family with reasoning_effort enabled, o1/o3, Claude with extended
 * thinking). Rendered as a collapsible "Thought for Xs" row above the
 * assistant's first text/tool block — Claude / o1 pattern.
 *
 * Persisted in the message so reload of an old conversation still shows
 * the reasoning trace. Optional `durationMs` lets the UI surface elapsed
 * time without re-computing from token counts.
 */
export interface ReasoningBlock {
  type: 'reasoning';
  content: string;
  durationMs?: number;
}

/**
 * Legacy bridge: render an old `content` string as a single text block.
 * Used by the Phase 4 client when `blocks === null`.
 */
export function blocksFromLegacyContent(content: string): MessageBlock[] {
  return [{ type: 'text', content }];
}

/**
 * Collapse adjacent text blocks. The loop may emit many text_delta events
 * that accumulate into many small text blocks; on persistence we merge
 * them so the rendered transcript stays clean.
 */
export function coalesceTextBlocks(blocks: MessageBlock[]): MessageBlock[] {
  const out: MessageBlock[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (b.type === 'text' && last?.type === 'text') {
      last.content += b.content;
    } else {
      out.push(b);
    }
  }
  return out;
}
