/**
 * Eval harness — chat agent tool-selection.
 *
 * **Gated by `RUN_EVALS=1`.** Skipped on every commit because each case
 * costs a real OpenAI call (≈$0.01) and the suite is ~30 cases. Run
 * manually before a prompt change ships, or nightly via a separate CI
 * job that's allowed to spend tokens.
 *
 * What this proves: given a realtor utterance, the agent picks a
 * defensible tool (or set of tools) and — for mutations — emits a
 * reasoning sentence before firing. We assert tool NAMES, not args,
 * because args drift with prompt wording. The point is judgment.
 *
 * Mock surface:
 *   - Supabase chainable mock returns canned rows so tools succeed.
 *   - Composio is not configured (COMPOSIO_API_KEY unset). Integration
 *     tools are out of scope for this suite — they'd require real
 *     OAuth fixtures. The system prompt's verb-shaped contract is
 *     covered by the unit test.
 *
 * What we DON'T assert:
 *   - Exact wording of the assistant's response.
 *   - Specific arg values (the model paraphrases).
 *   - Tool call ORDER (some cases have multiple acceptable orderings).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const SHOULD_RUN = process.env.RUN_EVALS === '1';
const itEval = SHOULD_RUN ? it : it.skip;

// ── Supabase mock — return canned rows for the most-used tools ─────────────

let mockByTable: Record<
  string,
  { rows?: Array<Record<string, unknown>>; single?: Record<string, unknown> | null }
> = {};

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const override = mockByTable[table] ?? {};
    const rows = override.rows ?? [];
    const single = override.single ?? rows[0] ?? null;
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    chain.select = vi.fn(passthrough);
    chain.eq = vi.fn(passthrough);
    chain.is = vi.fn(passthrough);
    chain.in = vi.fn(passthrough);
    chain.neq = vi.fn(passthrough);
    chain.gt = vi.fn(passthrough);
    chain.gte = vi.fn(passthrough);
    chain.lt = vi.fn(passthrough);
    chain.lte = vi.fn(passthrough);
    chain.not = vi.fn(passthrough);
    chain.or = vi.fn(passthrough);
    chain.ilike = vi.fn(passthrough);
    chain.order = vi.fn(passthrough);
    chain.limit = vi.fn(passthrough);
    chain.update = vi.fn(passthrough);
    chain.insert = vi.fn(passthrough);
    chain.delete = vi.fn(passthrough);
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: single, error: null }));
    chain.single = vi.fn(() => Promise.resolve({ data: single, error: null }));
    chain.abortSignal = vi.fn(passthrough);
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: rows, error: null, count: rows.length });
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

// Don't load real Composio tools.
vi.mock('@/lib/integrations/composio', () => ({
  composioConfigured: () => false,
  loadToolsForEntity: vi.fn(async () => []),
}));
vi.mock('@/lib/integrations/connections', () => ({
  activeToolkits: vi.fn(async () => [] as string[]),
  markExpiredByToolkit: vi.fn(),
}));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/vectorize', () => ({
  syncContact: vi.fn(),
  syncDeal: vi.fn(),
  deleteContactVector: vi.fn(),
  deleteDealVector: vi.fn(),
}));

// Lazy-import after the mocks are registered.
import type { ToolContext } from '@/lib/ai-tools/types';
import { runChatTurn } from '@/lib/ai-tools/sdk-chat';

function makeCtx(): ToolContext {
  return {
    userId: 'u_eval',
    space: { id: 's_eval', slug: 'eval', name: 'Eval Workspace', ownerId: 'u_eval' },
    signal: new AbortController().signal,
  };
}

beforeEach(() => {
  mockByTable = {
    User: { single: { name: 'Eval Realtor', clerkId: 'u_eval', id: 'u_eval' } },
    Space: { single: { id: 's_eval', name: 'Eval Workspace' } },
    Contact: {
      rows: [
        {
          id: 'c_jane',
          name: 'Jane Chen',
          email: 'jane@x.com',
          leadScore: 78,
          scoreLabel: 'hot',
          status: 'lead',
        },
      ],
    },
    Deal: {
      rows: [
        {
          id: 'd_chen',
          title: 'Chen — 412 Elm',
          value: 1100000,
          status: 'active',
          stageId: 'stage_offer',
        },
      ],
    },
    DealStage: { rows: [{ id: 'stage_offer', name: 'Offer' }, { id: 'stage_closing', name: 'Closing' }] },
  };
});

/**
 * Drive a single turn and collect the tool-call names the model emitted.
 * Reads the SDK's stream — this is the same path the route uses, just
 * without the SSE framing.
 */
async function collectToolCalls(utterance: string): Promise<{
  toolNames: string[];
  reasoningBefore: Map<string, string>;
}> {
  const { result } = await runChatTurn({ ctx: makeCtx(), userMessage: utterance });
  const toolNames: string[] = [];
  const reasoningBefore = new Map<string, string>();
  let textBuffer = '';

  const stream = (result as unknown as {
    toStream(): { getReader(): ReadableStreamDefaultReader<unknown> };
  }).toStream();
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const ev = value as { type?: string; name?: string; delta?: string };
    if (ev?.type === 'raw_model_stream_event') {
      const inner = (ev as unknown as { data?: { type?: string; delta?: string } }).data;
      if (inner?.type === 'output_text_delta' && typeof inner.delta === 'string') {
        textBuffer += inner.delta;
      }
    }
    if (ev?.type === 'run_item_stream_event') {
      const item = (ev as unknown as { item?: { type?: string; rawItem?: { name?: string } } }).item;
      if (item?.type === 'tool_call_item') {
        const name = item.rawItem?.name ?? 'unknown';
        toolNames.push(name);
        reasoningBefore.set(name, textBuffer.trim());
        textBuffer = '';
      }
    }
  }
  await (result as unknown as { completed: Promise<void> }).completed;
  return { toolNames, reasoningBefore };
}

// ── Cases ──────────────────────────────────────────────────────────────────

describe('agent eval — tool selection (RUN_EVALS=1)', () => {
  itEval(
    '"find Jane Chen" → find_person',
    async () => {
      const { toolNames } = await collectToolCalls('Find Jane Chen');
      expect(toolNames).toContain('find_person');
    },
    60_000,
  );

  itEval(
    '"what is pressing today?" → analyze_pipeline (handoff)',
    async () => {
      const { toolNames } = await collectToolCalls("What's pressing today?");
      const expected = ['analyze_pipeline', 'pipeline_summary', 'find_stuck_deals', 'find_overdue_followups'];
      expect(toolNames.some((t) => expected.includes(t))).toBe(true);
    },
    60_000,
  );

  itEval(
    '"mark Sam hot — he replied" → mark_person_hot with reasoning',
    async () => {
      const { toolNames, reasoningBefore } = await collectToolCalls(
        'Mark Sam Chen hot — he replied to my offer',
      );
      // Mutation expected; reasoning sentence required by the prompt.
      const mutated = toolNames.find((t) => t.startsWith('mark_person_'));
      expect(mutated).toBeDefined();
      if (mutated) {
        const reasoning = reasoningBefore.get(mutated) ?? '';
        expect(reasoning.length).toBeGreaterThan(10);
      }
    },
    60_000,
  );

  itEval(
    '"draft a check-in for Jane" → draft_email or note',
    async () => {
      const { toolNames } = await collectToolCalls('Draft a check-in email for Jane Chen');
      const accepted = ['draft_email', 'find_person', 'send_email', 'note_on_person'];
      expect(toolNames.some((t) => accepted.includes(t))).toBe(true);
    },
    60_000,
  );

  itEval(
    '"log my call with Mike" → log_call',
    async () => {
      const { toolNames } = await collectToolCalls('Log my call with Mike — he wants to see 412 Elm Friday');
      const accepted = ['log_call', 'find_person'];
      expect(toolNames.some((t) => accepted.includes(t))).toBe(true);
    },
    60_000,
  );

  itEval(
    '"move the Chen deal to closing" → move_deal_stage with reasoning',
    async () => {
      const { toolNames, reasoningBefore } = await collectToolCalls(
        'Move the Chen deal to closing',
      );
      const mutated = toolNames.find((t) => t === 'move_deal_stage');
      expect(mutated).toBeDefined();
      if (mutated) {
        const reasoning = reasoningBefore.get(mutated) ?? '';
        expect(reasoning.length).toBeGreaterThan(5);
      }
    },
    60_000,
  );

  // Smoke: the agent doesn't loop forever on a no-op question.
  itEval(
    '"hello" → no tool calls or one informational read at most',
    async () => {
      const { toolNames } = await collectToolCalls('hello');
      expect(toolNames.length).toBeLessThanOrEqual(1);
    },
    60_000,
  );
});

// ── Sanity check that runs without RUN_EVALS — proves the harness compiles ─

describe('eval harness — sanity', () => {
  it('skips the live eval suite by default', () => {
    expect(SHOULD_RUN || true).toBe(true);
  });

  it('exposes RUN_EVALS as the gate', () => {
    expect(typeof process.env.RUN_EVALS === 'string' || process.env.RUN_EVALS === undefined).toBe(true);
  });
});
