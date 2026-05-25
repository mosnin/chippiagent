/**
 * Shared LLM client for the on-demand agent.
 *
 * Thin wrapper over `lib/llm.ts` (the app-wide OpenRouter client). Kept as
 * its own module so the agent loop and tests have a stable import; the
 * provider / base-URL logic lives in one place in `lib/llm.ts`.
 */

import type OpenAI from 'openai';
import { getLLMClient } from '@/lib/llm';

/** Default model for the on-demand agent. OpenRouter slug. */
export { DEFAULT_CHAT_MODEL as AGENT_MODEL } from '@/lib/llm';

export interface OpenAIClientResult {
  client: OpenAI;
}

export class MissingOpenAIKeyError extends Error {
  constructor() {
    super('No LLM API key is configured for this environment.');
    this.name = 'MissingOpenAIKeyError';
  }
}

export function getOpenAIClient(): OpenAIClientResult {
  try {
    return { client: getLLMClient() };
  } catch {
    throw new MissingOpenAIKeyError();
  }
}
