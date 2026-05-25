/**
 * Per-realtor context that gets folded into the agent's system prompt at
 * the start of a chat turn.
 *
 * Why this exists — Musk lens: the prior prompt only knew the workspace
 * name and today's date. The agent saying "Hi user" or having to call
 * `pipeline_summary` to answer "what's pressing today" is the symptom.
 * Loading a tight snapshot once per turn (cached for 5 minutes per space)
 * gives the model the realtor's name + the loudest pipeline facts before
 * it picks up a tool. It saves tool calls AND sounds like the agent knows
 * the realtor.
 *
 * What it pulls:
 *   - Realtor's first name (Clerk → User table)
 *   - Counts: active deals, hot persons, overdue follow-ups, pending drafts
 *   - Connected integrations (just the names, so the prompt can reference
 *     them by realtor verb without naming SDK tool slugs)
 *
 * What it does NOT pull:
 *   - Full timelines or activity dumps. The agent has tools for that.
 *   - PII beyond first name. The model shouldn't be reciting the realtor's
 *     phone number back at them.
 *
 * Cache: same Map+TTL pattern as `context-enrichment.ts`. Five minutes is
 * the sweet spot — long enough that a chat session of 5-10 turns hits
 * cache, short enough that a stage move on a deal surfaces in a follow-up
 * conversation later in the same hour.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { activeToolkits } from '@/lib/integrations/connections';
import { findIntegration } from '@/lib/integrations/catalog';

const CACHE_TTL_MS = 5 * 60_000;

interface CacheEntry {
  data: PersonalizedSnapshot;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export interface PersonalizedSnapshot {
  /** Realtor's first name. Null if we couldn't resolve. */
  firstName: string | null;
  /** Active deals (status='active'). */
  activeDealCount: number;
  /** Hot-tier contacts not archived. */
  hotPersonCount: number;
  /** Contacts whose followUpAt is in the past. */
  overdueFollowUpCount: number;
  /** Pending AgentDraft rows the realtor needs to decide on. */
  pendingDraftCount: number;
  /** Connected integrations, mapped to display names. Empty when none. */
  connectedApps: string[];
}

interface SnapshotKey {
  spaceId: string;
  userId: string;
}

export async function buildPersonalizedSnapshot(
  args: SnapshotKey,
  opts: { now?: () => number } = {},
): Promise<PersonalizedSnapshot> {
  const now = opts.now ? opts.now() : Date.now();
  const key = `${args.spaceId}:${args.userId}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.data;

  const data = await loadFresh(args);
  cache.set(key, { data, expiresAt: now + CACHE_TTL_MS });
  return data;
}

async function loadFresh(args: SnapshotKey): Promise<PersonalizedSnapshot> {
  const empty: PersonalizedSnapshot = {
    firstName: null,
    activeDealCount: 0,
    hotPersonCount: 0,
    overdueFollowUpCount: 0,
    pendingDraftCount: 0,
    connectedApps: [],
  };

  const nowIso = new Date().toISOString();

  // Five queries fired in parallel — we'd rather one round-trip per turn
  // (worst case: one of them errors, we still get the others).
  const [nameResult, dealsResult, hotResult, overdueResult, draftsResult, toolkitsResult] =
    await Promise.allSettled([
      supabase
        .from('User')
        .select('name, email')
        .eq('clerkId', args.userId)
        .maybeSingle(),
      supabase
        .from('Deal')
        .select('id', { count: 'exact', head: true })
        .eq('spaceId', args.spaceId)
        .eq('status', 'active'),
      supabase
        .from('Contact')
        .select('id', { count: 'exact', head: true })
        .eq('spaceId', args.spaceId)
        .is('snoozedUntil', null)
        .eq('scoreLabel', 'hot'),
      supabase
        .from('Contact')
        .select('id', { count: 'exact', head: true })
        .eq('spaceId', args.spaceId)
        .is('snoozedUntil', null)
        .lt('followUpAt', nowIso),
      supabase
        .from('AgentDraft')
        .select('id', { count: 'exact', head: true })
        .eq('spaceId', args.spaceId)
        .eq('status', 'pending'),
      activeToolkits({ spaceId: args.spaceId, userId: args.userId }),
    ]);

  if (nameResult.status === 'fulfilled' && nameResult.value.data) {
    const fullName = (nameResult.value.data as { name?: string }).name;
    if (fullName) {
      const trimmed = fullName.trim().split(/\s+/)[0];
      empty.firstName = trimmed && trimmed.length > 0 ? trimmed : null;
    }
  } else if (nameResult.status === 'rejected') {
    logger.warn('[personalized-prompt] name fetch failed', { err: String(nameResult.reason) });
  }

  if (dealsResult.status === 'fulfilled') {
    empty.activeDealCount = dealsResult.value.count ?? 0;
  }
  if (hotResult.status === 'fulfilled') {
    empty.hotPersonCount = hotResult.value.count ?? 0;
  }
  if (overdueResult.status === 'fulfilled') {
    empty.overdueFollowUpCount = overdueResult.value.count ?? 0;
  }
  if (draftsResult.status === 'fulfilled') {
    empty.pendingDraftCount = draftsResult.value.count ?? 0;
  }
  if (toolkitsResult.status === 'fulfilled') {
    const slugs = toolkitsResult.value;
    empty.connectedApps = slugs
      .map((slug) => findIntegration(slug)?.name ?? slug)
      .sort();
  }

  return empty;
}

/**
 * Render the snapshot into the markdown the agent's system prompt embeds.
 * Returns the empty string when there's nothing useful to say — the prompt
 * builder skips the section entirely rather than printing "0 active deals,
 * 0 hot persons" which sounds like a brand new account every turn.
 */
export function renderSnapshot(s: PersonalizedSnapshot): string {
  const lines: string[] = [];
  if (s.firstName) {
    lines.push(`Realtor: ${s.firstName}.`);
  }
  const facts: string[] = [];
  if (s.activeDealCount > 0) {
    facts.push(`${s.activeDealCount} active deal${s.activeDealCount === 1 ? '' : 's'}`);
  }
  if (s.hotPersonCount > 0) {
    facts.push(`${s.hotPersonCount} hot person${s.hotPersonCount === 1 ? '' : 's'}`);
  }
  if (s.overdueFollowUpCount > 0) {
    facts.push(`${s.overdueFollowUpCount} overdue follow-up${s.overdueFollowUpCount === 1 ? '' : 's'}`);
  }
  if (s.pendingDraftCount > 0) {
    facts.push(`${s.pendingDraftCount} pending draft${s.pendingDraftCount === 1 ? '' : 's'}`);
  }
  if (facts.length > 0) {
    lines.push(`Snapshot: ${facts.join(', ')}.`);
  }
  if (s.connectedApps.length > 0) {
    lines.push(`Connected: ${s.connectedApps.join(', ')}.`);
  }
  if (lines.length === 0) return '';
  return lines.join('\n');
}

/** Test helper. */
export function __resetPersonalizedSnapshotCacheForTests() {
  cache.clear();
}
