/**
 * Tests for the TS-side AgentMemory module.
 *
 * Covers:
 *   - embed() calls OpenAI with text-embedding-3-small
 *   - empty-string input throws (both embed and storeMemory and recallMemory)
 *   - storeMemory embeds + inserts in one round trip with translated entity
 *   - recallMemory calls match_agent_memory rpc with the embedded query +
 *     filters (kind / contactId / dealId narrow the search correctly)
 *   - results are mapped from the rpc's column shape to the public MemoryEntry
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── OpenAI mock ───────────────────────────────────────────────────────────
const { embeddingsCreateMock } = vi.hoisted(() => ({
  embeddingsCreateMock: vi.fn(),
}));

vi.mock('@/lib/ai-tools/openai-client', () => ({
  AGENT_MODEL: 'gpt-4.1-mini',
  MissingOpenAIKeyError: class extends Error {},
  getOpenAIClient: () => ({
    client: {
      embeddings: { create: embeddingsCreateMock },
    },
  }),
}));

// ── Supabase mock ─────────────────────────────────────────────────────────
// Captures the LAST insert + last rpc call so tests can assert on them.
const { insertCaptured, rpcCaptured, supabaseMock } = vi.hoisted(() => {
  const insert = { table: '' as string, payload: null as unknown };
  const rpc = { fn: '' as string, args: null as unknown, response: { data: [] as unknown, error: null as { message: string } | null } };

  const fromMock = vi.fn((table: string) => {
    insert.table = table;
    return {
      insert(payload: unknown) {
        insert.payload = payload;
        return {
          select() {
            return {
              single: vi.fn(() => Promise.resolve({ data: { id: 'mem_1' }, error: null })),
            };
          },
        };
      },
    };
  });

  const rpcMock = vi.fn((fn: string, args: unknown) => {
    rpc.fn = fn;
    rpc.args = args;
    return Promise.resolve(rpc.response);
  });

  return {
    insertCaptured: insert,
    rpcCaptured: rpc,
    supabaseMock: { from: fromMock, rpc: rpcMock },
  };
});

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));

import { embed } from '@/lib/agent-memory/embed';
import { storeMemory, recallMemory } from '@/lib/agent-memory/store';

beforeEach(() => {
  embeddingsCreateMock.mockReset();
  supabaseMock.from.mockClear();
  supabaseMock.rpc.mockClear();
  insertCaptured.payload = null;
  insertCaptured.table = '';
  rpcCaptured.args = null;
  rpcCaptured.fn = '';
  rpcCaptured.response = { data: [], error: null };
});

function makeVec(): number[] {
  // 1536-dim vector; fill with deterministic values so we can spot-check.
  return Array.from({ length: 1536 }, (_, i) => (i % 7) / 7);
}

function mockEmbedOnce(vec: number[] = makeVec()) {
  embeddingsCreateMock.mockResolvedValueOnce({ data: [{ embedding: vec }] });
}

// ── embed ─────────────────────────────────────────────────────────────────
describe('embed', () => {
  it('calls OpenAI with text-embedding-3-small', async () => {
    mockEmbedOnce();
    await embed('hello world');
    expect(embeddingsCreateMock).toHaveBeenCalledTimes(1);
    const [body] = embeddingsCreateMock.mock.calls[0];
    expect(body.model).toBe('text-embedding-3-small');
    expect(body.input).toBe('hello world');
  });

  it('throws on empty input without calling OpenAI', async () => {
    await expect(embed('')).rejects.toThrow(/empty/);
    await expect(embed('   ')).rejects.toThrow(/empty/);
    expect(embeddingsCreateMock).not.toHaveBeenCalled();
  });

  it('throws when the embedding has the wrong dimension', async () => {
    embeddingsCreateMock.mockResolvedValueOnce({ data: [{ embedding: [0.1, 0.2, 0.3] }] });
    await expect(embed('hi')).rejects.toThrow(/dimension/);
  });

  it('truncates input over 8000 chars before sending', async () => {
    mockEmbedOnce();
    const long = 'x'.repeat(9_000);
    await embed(long);
    const [body] = embeddingsCreateMock.mock.calls[0];
    expect((body.input as string).length).toBe(8_000);
  });
});

// ── storeMemory ───────────────────────────────────────────────────────────
describe('storeMemory', () => {
  it('embeds and inserts in a single round trip, mapping contactId → entityType=contact', async () => {
    mockEmbedOnce();
    const result = await storeMemory({
      spaceId: 'space_1',
      contactId: 'c_sam',
      kind: 'fact',
      content: 'Sam wants Berkeley schools',
      importance: 0.8,
    });

    expect(result.id).toBe('mem_1');
    expect(embeddingsCreateMock).toHaveBeenCalledTimes(1);
    expect(insertCaptured.table).toBe('AgentMemory');
    const payload = insertCaptured.payload as Record<string, unknown>;
    expect(payload.spaceId).toBe('space_1');
    expect(payload.entityType).toBe('contact');
    expect(payload.entityId).toBe('c_sam');
    expect(payload.memoryType).toBe('fact');
    expect(payload.content).toBe('Sam wants Berkeley schools');
    expect(payload.importance).toBe(0.8);
    // Embedding is serialised as a pgvector string literal '[..]'.
    expect(typeof payload.embedding).toBe('string');
    expect(payload.embedding as string).toMatch(/^\[/);
    expect(payload.embedding as string).toMatch(/\]$/);
  });

  it('falls back to entityType=space when no contact/deal is provided', async () => {
    mockEmbedOnce();
    await storeMemory({
      spaceId: 'space_1',
      kind: 'observation',
      content: 'workspace prefers SMS over email',
    });
    const payload = insertCaptured.payload as Record<string, unknown>;
    expect(payload.entityType).toBe('space');
    expect(payload.entityId).toBe('space_1');
  });

  it('prefers contactId over dealId when both are passed', async () => {
    mockEmbedOnce();
    await storeMemory({
      spaceId: 'space_1',
      contactId: 'c_1',
      dealId: 'd_1',
      kind: 'fact',
      content: 'contact-focused fact',
    });
    const payload = insertCaptured.payload as Record<string, unknown>;
    expect(payload.entityType).toBe('contact');
    expect(payload.entityId).toBe('c_1');
  });

  it('clamps importance into [0, 1]', async () => {
    mockEmbedOnce();
    await storeMemory({
      spaceId: 'space_1',
      kind: 'fact',
      content: 'x',
      importance: 9.9,
    });
    const payload = insertCaptured.payload as Record<string, unknown>;
    expect(payload.importance).toBe(1);
  });

  it('throws on empty content without embedding', async () => {
    await expect(
      storeMemory({ spaceId: 'space_1', kind: 'fact', content: '   ' }),
    ).rejects.toThrow(/empty/);
    expect(embeddingsCreateMock).not.toHaveBeenCalled();
  });
});

// ── recallMemory ──────────────────────────────────────────────────────────
describe('recallMemory', () => {
  it('embeds the query and calls match_agent_memory rpc', async () => {
    mockEmbedOnce();
    rpcCaptured.response = {
      data: [
        {
          id: 'm_a',
          content: 'high-similarity match',
          memoryType: 'fact',
          entityType: 'contact',
          entityId: 'c_1',
          importance: 0.7,
          similarity: 0.91,
          createdAt: '2026-04-01T00:00:00.000Z',
        },
        {
          id: 'm_b',
          content: 'lower match',
          memoryType: 'observation',
          entityType: 'contact',
          entityId: 'c_1',
          importance: 0.4,
          similarity: 0.55,
          createdAt: '2026-04-02T00:00:00.000Z',
        },
      ],
      error: null,
    };

    const out = await recallMemory({ spaceId: 'space_1', query: 'school district' });
    expect(rpcCaptured.fn).toBe('match_agent_memory');
    const args = rpcCaptured.args as Record<string, unknown>;
    expect(args.match_space_id).toBe('space_1');
    expect(args.match_count).toBe(6); // default k
    expect(args.filter_memory_type).toBeNull();
    expect(args.filter_entity_type).toBeNull();
    expect(args.filter_entity_id).toBeNull();
    expect(typeof args.query_embedding).toBe('string');

    expect(out).toHaveLength(2);
    // The rpc returns rows in order; we don't re-sort. Verify mapping.
    expect(out[0]).toMatchObject({
      id: 'm_a',
      content: 'high-similarity match',
      kind: 'fact',
      similarity: 0.91,
      importance: 0.7,
      entityType: 'contact',
      entityId: 'c_1',
    });
    // First hit's similarity should be >= second's (the rpc orders, we trust).
    expect((out[0].similarity ?? 0)).toBeGreaterThanOrEqual(out[1].similarity ?? 0);
  });

  it('forwards kind / contactId / dealId filters into the rpc args', async () => {
    mockEmbedOnce();
    rpcCaptured.response = { data: [], error: null };

    await recallMemory({
      spaceId: 'space_1',
      query: 'pre-approval',
      kind: 'fact',
      contactId: 'c_sam',
      k: 3,
      minSimilarity: 0.4,
    });

    const args = rpcCaptured.args as Record<string, unknown>;
    expect(args.filter_memory_type).toBe('fact');
    expect(args.filter_entity_type).toBe('contact');
    expect(args.filter_entity_id).toBe('c_sam');
    expect(args.match_count).toBe(3);
    expect(args.min_similarity).toBe(0.4);
  });

  it('translates dealId into entityType=deal filter', async () => {
    mockEmbedOnce();
    rpcCaptured.response = { data: [], error: null };

    await recallMemory({ spaceId: 'space_1', query: 'closing', dealId: 'd_42' });
    const args = rpcCaptured.args as Record<string, unknown>;
    expect(args.filter_entity_type).toBe('deal');
    expect(args.filter_entity_id).toBe('d_42');
  });

  it('caps k at 50', async () => {
    mockEmbedOnce();
    rpcCaptured.response = { data: [], error: null };
    await recallMemory({ spaceId: 'space_1', query: 'x', k: 999 });
    const args = rpcCaptured.args as Record<string, unknown>;
    expect(args.match_count).toBe(50);
  });

  it('throws on empty query without embedding or rpc', async () => {
    await expect(recallMemory({ spaceId: 'space_1', query: '   ' })).rejects.toThrow(/empty/);
    expect(embeddingsCreateMock).not.toHaveBeenCalled();
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it('surfaces rpc errors as thrown exceptions', async () => {
    mockEmbedOnce();
    rpcCaptured.response = { data: null, error: { message: 'function not found' } };
    await expect(recallMemory({ spaceId: 'space_1', query: 'x' })).rejects.toThrow(
      /function not found/,
    );
  });
});
