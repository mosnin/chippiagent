/**
 * Generates the /chippi home sentence with OpenAI.
 *
 * The deterministic ladder in `lib/morning-story.ts` still ships as fallback
 * — it runs on the client with the API response. This module's job is to
 * produce a one-sentence override the realtor sees instead of the canned
 * ladder line, only when the agent succeeds within a tight budget.
 *
 * Hard rules:
 *   - 5-second timeout. The home cannot block on the agent.
 *   - In-memory cache, 5-minute TTL, keyed on `${spaceId}:${signatureHash}`
 *     so the agent isn't called on every page load — only when the named
 *     subjects actually change.
 *   - If OPENAI_API_KEY is missing, return null (the caller falls back).
 *   - Any error returns null. We never throw upward into the route.
 */
import { createHash } from 'crypto';
import type OpenAI from 'openai';
import { getLLMClient, hasLLMKey, openaiModel } from '@/lib/llm';
import type { MorningSummary } from '@/app/api/agent/morning/route';

const TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MODEL = 'gpt-4.1-mini';

interface CacheEntry {
  sentence: string;
  expiresAt: number;
}

// Per-Node-process cache. Good enough for v1; cache keys are scoped per
// space, so cross-tenant collision is impossible.
const cache = new Map<string, CacheEntry>();

/**
 * The bits of the summary the agent actually composes about. Counts without
 * a named subject don't move the cache key — they're not in the sentence.
 */
function namedSubjectsSignature(s: MorningSummary): string {
  const sig = {
    stuck: s.topStuckDeal
      ? { id: s.topStuckDeal.id, days: s.topStuckDeal.daysStuck }
      : null,
    overdue: s.topOverdueFollowUp
      ? { id: s.topOverdueFollowUp.id, days: s.topOverdueFollowUp.daysOverdue }
      : null,
    newP: s.topNewPerson?.id ?? null,
    hot: s.topHotPerson?.id ?? null,
  };
  return createHash('sha256').update(JSON.stringify(sig)).digest('hex');
}

/** True when there's a named subject worth a tailored sentence. */
function hasNamedSubject(s: MorningSummary): boolean {
  return Boolean(
    s.topStuckDeal || s.topOverdueFollowUp || s.topNewPerson || s.topHotPerson,
  );
}

const SYSTEM_PROMPT =
  "Compose ONE sentence as Chippi, the AI assistant for a real-estate CRM. " +
  "Names subjects, not counts. Direct, warm, no marketing copy. " +
  "Return only the sentence, nothing else.";

export interface ComposeOptions {
  /** Inject for tests; defaults to the real OpenAI client. */
  client?: OpenAI;
  /** Override for tests so we don't hit Date.now() instabilities. */
  now?: () => number;
}

/**
 * Generate the morning sentence. Returns null on miss/timeout/no-key/no-subject.
 * Never throws.
 */
export async function composeAgentSentence(
  spaceId: string,
  summary: MorningSummary,
  opts: ComposeOptions = {},
): Promise<string | null> {
  if (!hasNamedSubject(summary)) return null;

  if (!hasLLMKey() && !opts.client) return null;

  const now = opts.now ? opts.now() : Date.now();
  const sigHash = namedSubjectsSignature(summary);
  const cacheKey = `${spaceId}:${sigHash}`;

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.sentence;
  }

  const client = opts.client ?? getLLMClient();

  // Only ship the named subjects + their salient facts. We don't need to
  // hand the model the full summary — it'd just invite hallucination of
  // counts the realtor didn't ask for.
  const userPayload = {
    stuckDeal: summary.topStuckDeal,
    overdueFollowUp: summary.topOverdueFollowUp,
    newPerson: summary.topNewPerson,
    hotPerson: summary.topHotPerson,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await client.chat.completions.create(
      {
        model: openaiModel(MODEL),
        temperature: 0.5,
        max_tokens: 60,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
      },
      { signal: controller.signal },
    );
    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;
    // One sentence only. Strip wrapping quotes if the model added them.
    const sentence = raw.replace(/^["'“‘]+|["'”’]+$/g, '').trim();
    if (!sentence) return null;
    cache.set(cacheKey, { sentence, expiresAt: now + CACHE_TTL_MS });
    return sentence;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Test-only: blow the cache between cases. */
export function __resetMorningAgentCacheForTests() {
  cache.clear();
}
