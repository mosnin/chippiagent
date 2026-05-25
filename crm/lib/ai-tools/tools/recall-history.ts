/**
 * `recall_history` — semantic recall over the AgentMemory store.
 *
 * Was: keyword ILIKE over ContactActivity / DealActivity rows. That searched
 * EVENT logs (calls, notes, emails), not what was actually said in
 * conversations, and produced miss rates that the model couldn't predict.
 *
 * Is now: vector cosine similarity over the same `AgentMemory` table the
 * Python runtime writes to. The model can ask "what did Sam say about the
 * school district last month?" and get back ranked memories regardless of
 * exact word choice.
 *
 * Tool name + parameter shape are preserved so existing call sites and the
 * system prompt don't need to change. Only the implementation and the
 * `searchKind` field on the result change.
 *
 * Filters:
 *   - personId → narrow to one contact
 *   - dealId   → narrow to one deal
 *   - both unset → workspace-wide
 *
 * Read-only. Auth-scoped via `ctx.space.id`.
 */

import { z } from 'zod';
import { defineTool } from '../types';
import { recallMemory } from '@/lib/agent-memory/store';

const parameters = z
  .object({
    personId: z.string().min(1).optional().describe('Restrict to one Contact.'),
    dealId: z.string().min(1).optional().describe('Restrict to one Deal.'),
    query: z.string().trim().min(1).max(200).describe('What to look for. Phrased as natural language.'),
  })
  .describe('Recall what was said in past conversations using semantic search.');

interface MemoryHit {
  id: string;
  excerpt: string;
  date: string;
  similarity: number;
  kind: string;
}

interface RecallResult {
  searchKind: 'semantic';
  hits: MemoryHit[];
}

const EXCERPT_MAX = 200;

function makeExcerpt(content: string): string {
  const v = (content ?? '').trim().replace(/\s+/g, ' ');
  if (v.length <= EXCERPT_MAX) return v;
  return v.slice(0, EXCERPT_MAX - 1) + '…';
}

export const recallHistoryTool = defineTool<typeof parameters, RecallResult>({
  name: 'recall_history',
  riskLevel: 'safe',
  description:
    'Recall what was said in past conversations using semantic search. Returns ranked memories about a person or deal.',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    let entries;
    try {
      entries = await recallMemory({
        spaceId: ctx.space.id,
        query: args.query,
        k: 8,
        contactId: args.personId,
        dealId: args.dealId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      return {
        summary: `Recall failed: ${message}`,
        data: { searchKind: 'semantic' as const, hits: [] },
        display: 'error',
      };
    }

    const hits: MemoryHit[] = entries.map((e) => ({
      id: e.id,
      excerpt: makeExcerpt(e.content),
      date: e.createdAt,
      similarity: typeof e.similarity === 'number' ? Math.round(e.similarity * 1000) / 1000 : 0,
      kind: e.kind,
    }));

    return {
      summary:
        hits.length === 0
          ? `No memories matched "${args.query}".`
          : `${hits.length} memor${hits.length === 1 ? 'y' : 'ies'} matched "${args.query}" (semantic search).`,
      data: { searchKind: 'semantic' as const, hits },
      display: 'plain',
    };
  },
});
