/**
 * LLM provider — OpenRouter.
 *
 * Every model call in the app (chat agent, autonomous runs, embeddings,
 * lead-scoring enhancement, the legacy RAG route) goes through one OpenAI
 * client built here. OpenRouter is OpenAI-API-compatible, so the only
 * difference from calling OpenAI directly is the base URL + key.
 *
 * Fallback: when `OPENROUTER_API_KEY` is absent the client falls back to
 * calling OpenAI directly with `OPENAI_API_KEY`, so a deploy that hasn't
 * set the OpenRouter key keeps working.
 *
 * The Python agent has its own equivalent at `agent/llm.py`. The chat
 * model registry lives in `./chat-models` (pure data, client-safe) and is
 * re-exported here for server-side convenience.
 */

import OpenAI from 'openai';

export {
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL,
  isValidChatModel,
  type ChatModelOption,
} from './chat-models';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Build the shared LLM client. Routes through OpenRouter when configured,
 * otherwise OpenAI direct. Throws only when neither key is present.
 */
export function getLLMClient(): OpenAI {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    return new OpenAI({ apiKey: openRouterKey, baseURL: OPENROUTER_BASE_URL });
  }
  const openAIKey = process.env.OPENAI_API_KEY;
  if (openAIKey) {
    return new OpenAI({ apiKey: openAIKey });
  }
  throw new Error('No LLM key configured — set OPENROUTER_API_KEY (or OPENAI_API_KEY).');
}

/** True once OpenRouter is the active provider. */
export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/** True when at least one LLM provider key is configured (OpenRouter or OpenAI). */
export function hasLLMKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY);
}

/**
 * Resolve a bare OpenAI model name to the slug the active provider wants —
 * vendor-prefixed (`openai/...`) for OpenRouter, bare for OpenAI direct.
 * Use for internal utility calls (embeddings, scoring, compaction). The
 * realtor-pickable chat models in CHAT_MODELS are already OpenRouter slugs.
 */
export function openaiModel(name: string): string {
  return isOpenRouterConfigured() ? `openai/${name}` : name;
}

/**
 * Embedding model slug. OpenRouter and OpenAI both resolve this to the
 * same underlying model, so stored 1536-dim vectors stay valid across the
 * provider switch — do NOT change this without re-embedding the corpus.
 */
export const EMBEDDING_MODEL = isOpenRouterConfigured()
  ? 'openai/text-embedding-3-small'
  : 'text-embedding-3-small';
