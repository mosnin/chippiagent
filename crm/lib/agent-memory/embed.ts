/**
 * Single-purpose embedding wrapper for the AgentMemory module.
 *
 * Why not reuse `lib/embeddings.ts`? That one already exists, lazily inits an
 * `OpenAI` client, and uses `text-embedding-3-small`. We delegate to the
 * shared `getOpenAIClient()` so the API key handling matches the agent loop.
 *
 * Hard rules:
 *   - empty/whitespace input throws — caller has to be explicit about
 *     "should I embed this?"
 *   - 5s timeout — embeddings are usually <300ms; if we're hung, fail fast
 *   - throws on failure — `storeMemory` and `recallMemory` decide whether to
 *     swallow it. The Python side falls back to keyword search; we don't even
 *     have that option here, so let the caller see the error.
 */

import { getOpenAIClient } from '../ai-tools/openai-client';

export const EMBED_MODEL = 'text-embedding-3-small';
export const EMBED_DIMS = 1536;
const TIMEOUT_MS = 5_000;
const MAX_INPUT_CHARS = 8_000; // well under the 8191-token cap

export async function embed(text: string): Promise<number[]> {
  const cleaned = (text ?? '').trim();
  if (!cleaned) {
    throw new Error('embed: input is empty');
  }

  const input = cleaned.length > MAX_INPUT_CHARS ? cleaned.slice(0, MAX_INPUT_CHARS) : cleaned;
  const { client } = getOpenAIClient();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await client.embeddings.create(
      { model: EMBED_MODEL, input },
      { signal: controller.signal },
    );
    const vec = res.data[0]?.embedding;
    if (!vec || vec.length !== EMBED_DIMS) {
      throw new Error(
        `embed: unexpected dimension ${vec?.length ?? 'undefined'} (expected ${EMBED_DIMS})`,
      );
    }
    return vec as number[];
  } finally {
    clearTimeout(timer);
  }
}
