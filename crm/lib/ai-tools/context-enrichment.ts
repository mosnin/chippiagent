/**
 * Phase 13 — auto-include subject context in agent prompts.
 *
 * The agent already has tools to fetch a contact's score, a deal's stage,
 * and recent activity. But when the realtor opens the action sheet on a
 * specific deal or person, the subject is *known* — having the model spend
 * a turn calling `find_person` just to discover what it could have been
 * told is wasted latency and wasted tokens.
 *
 * This helper consolidates the "what does the model need to know about
 * this subject?" query into one shape, so the prompt-builder (and the
 * quick-draft compose path) can pass it as ground truth and skip the
 * fetch-by-tool dance.
 *
 * Pure server-side: takes a `SubjectContext` + `spaceId`, returns an
 * `EnrichedContext | null`. Read-only. No mutations. No side effects.
 *
 * Activity formatting is one shape, not two ("verbose" vs "compact").
 * The agent reads what we give it.
 */

import { supabase } from '@/lib/supabase';

export interface SubjectContext {
  kind: 'deal' | 'person';
  id: string;
}

export interface EnrichedContext {
  subjectLabel: string;
  stage?: string;
  status?: string;
  scoreLabel?: string | null;
  leadScore?: number | null;
  /** Up to 3 lines, newest first, format: "YYYY-MM-DD — type: content". */
  lastActivities: string[];
  daysSinceLastTouch: number | null;
}

const ACTIVITY_CONTENT_MAX = 80;

function isoDate(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return d.toISOString().slice(0, 10);
}

function trimContent(s: string | null): string {
  const v = (s ?? '').trim().replace(/\s+/g, ' ');
  if (v.length <= ACTIVITY_CONTENT_MAX) return v;
  return v.slice(0, ACTIVITY_CONTENT_MAX - 1) + '…';
}

function daysBetween(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000));
}

async function fetchActivities(
  contactId: string,
  spaceId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('ContactActivity')
    .select('type, content, createdAt')
    .eq('contactId', contactId)
    .eq('spaceId', spaceId)
    .order('createdAt', { ascending: false })
    .limit(3);

  const rows = (data ?? []) as Array<{
    type: string;
    content: string | null;
    createdAt: string;
  }>;

  return rows.map((r) => {
    const date = isoDate(r.createdAt);
    const content = trimContent(r.content);
    return content ? `${date} — ${r.type}: ${content}` : `${date} — ${r.type}`;
  });
}

// ── In-process cache ─────────────────────────────────────────────────────────
//
// Same subject-context query rerunning every 30s costs us four supabase round
// trips and ~150ms per draft. Memoize for 5 minutes per (spaceId, kind, id) —
// short enough that a stage change or a new activity becomes visible quickly,
// long enough to absorb the burst pattern (dashboard refresh, action sheet
// open, draft compose, retry).
//
// Per-key map, not a global var — a deal's data must never bleed into a
// different deal's response. Keyed on spaceId too so multi-tenant safety is
// enforced at the cache layer, not just at the query layer.
//
// In-process means cold lambdas miss; that's acceptable for v1. The same
// caveat applies to morning-story-agent's caches.
interface CacheEntry {
  data: EnrichedContext;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(spaceId: string, subject: SubjectContext): string {
  return `${spaceId}:${subject.kind}:${subject.id}`;
}

/** Test-only: drop every memoized entry. Production code must not call this. */
export function __resetEnrichContextCacheForTests(): void {
  cache.clear();
}

export async function enrichContext(
  subject: SubjectContext,
  spaceId: string,
  opts: { now?: Date } = {},
): Promise<EnrichedContext | null> {
  const now = opts.now ?? new Date();

  // Cache check uses real wall-clock time. The `opts.now` override is for the
  // shape of the activity output (date math), not for cache expiry — bending
  // both at once would let tests trivially break the eviction invariant.
  const key = cacheKey(spaceId, subject);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.data;
  }

  // Helper used by both branches — write through to the cache only on
  // successful resolves. Misses (deletes, wrong-space lookups) intentionally
  // bypass the cache so a freshly-created subject lands fresh data on the
  // next call instead of waiting out the TTL.
  const remember = (data: EnrichedContext): EnrichedContext => {
    cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
    return data;
  };

  if (subject.kind === 'deal') {
    const { data: deal } = await supabase
      .from('Deal')
      .select('id, title, contactId, status, stageId, updatedAt')
      .eq('id', subject.id)
      .eq('spaceId', spaceId)
      .maybeSingle();

    if (!deal) return null;
    const d = deal as {
      id: string;
      title: string | null;
      contactId: string | null;
      status: string | null;
      stageId: string | null;
      updatedAt: string | null;
    };

    let stage: string | undefined;
    if (d.stageId) {
      const { data: stageRow } = await supabase
        .from('DealStage')
        .select('name')
        .eq('id', d.stageId)
        .maybeSingle();
      const name = (stageRow as { name?: string } | null)?.name;
      if (name) stage = name;
    }

    const lastActivities = d.contactId
      ? await fetchActivities(d.contactId, spaceId)
      : [];

    const daysSinceLastTouch = d.updatedAt
      ? daysBetween(new Date(d.updatedAt), now)
      : null;

    return remember({
      subjectLabel: d.title ?? 'this deal',
      stage,
      status: d.status ?? undefined,
      lastActivities,
      daysSinceLastTouch,
    });
  }

  // person
  const { data: contact } = await supabase
    .from('Contact')
    .select('id, name, scoreLabel, leadScore, lastContactedAt')
    .eq('id', subject.id)
    .eq('spaceId', spaceId)
    .maybeSingle();

  if (!contact) return null;
  const c = contact as {
    id: string;
    name: string | null;
    scoreLabel: string | null;
    leadScore: number | null;
    lastContactedAt: string | null;
  };

  const lastActivities = await fetchActivities(c.id, spaceId);

  const daysSinceLastTouch = c.lastContactedAt
    ? daysBetween(new Date(c.lastContactedAt), now)
    : null;

  return remember({
    subjectLabel: c.name ?? 'this person',
    scoreLabel: c.scoreLabel,
    leadScore: c.leadScore,
    lastActivities,
    daysSinceLastTouch,
  });
}

/**
 * Render an EnrichedContext as a compact text block suitable for inclusion
 * in a system prompt or as a synthetic first user-message preamble.
 *
 * The shape is intentionally rigid — labels are stable so the model can
 * pattern-match and so the editorial-voice rules don't snag on freeform
 * filler. No marketing words. No "hope this helps." Just the facts.
 */
export function renderEnrichedContext(ctx: EnrichedContext): string {
  const lines: string[] = ['SUBJECT CONTEXT', `Subject: ${ctx.subjectLabel}`];
  if (ctx.stage) lines.push(`Stage: ${ctx.stage}`);
  if (ctx.status) lines.push(`Status: ${ctx.status}`);
  if (ctx.scoreLabel || ctx.leadScore != null) {
    const label = ctx.scoreLabel ?? 'unscored';
    const score = ctx.leadScore != null ? ` (${Math.round(ctx.leadScore)})` : '';
    lines.push(`Score: ${label}${score}`);
  }
  if (ctx.daysSinceLastTouch != null) {
    lines.push(`Days since last touch: ${ctx.daysSinceLastTouch}`);
  } else {
    lines.push(`Days since last touch: unknown`);
  }
  if (ctx.lastActivities.length > 0) {
    lines.push('Recent activity:');
    for (const a of ctx.lastActivities) lines.push(`- ${a}`);
  } else {
    lines.push('Recent activity: none recorded');
  }
  return lines.join('\n');
}

/**
 * Render the labeled-block form the system prompt promises: opens with
 * `[SUBJECT CONTEXT]`, closes with `[/SUBJECT CONTEXT]`, and is intended to
 * be prepended to the user's first message. The model treats labeled blocks
 * as ground truth more reliably than free-form preambles — the close tag is
 * what makes it visually unambiguous where the chat resumes.
 *
 * Body shape is identical to renderEnrichedContext (same fields, same order)
 * so we don't carry two divergent renderers; callers that want the bare
 * version still use renderEnrichedContext.
 */
export function renderEnrichedContextBlock(ctx: EnrichedContext): string {
  // Body uses the same field order as renderEnrichedContext but without the
  // leading "SUBJECT CONTEXT" header line — the [SUBJECT CONTEXT] tag plays
  // that role here.
  const lines: string[] = [`Subject: ${ctx.subjectLabel}`];
  if (ctx.stage) lines.push(`Stage: ${ctx.stage}`);
  if (ctx.status) lines.push(`Status: ${ctx.status}`);
  if (ctx.scoreLabel || ctx.leadScore != null) {
    const label = ctx.scoreLabel ?? 'unscored';
    const score = ctx.leadScore != null ? ` (${Math.round(ctx.leadScore)})` : '';
    lines.push(`Score: ${label}${score}`);
  }
  if (ctx.daysSinceLastTouch != null) {
    lines.push(`Days since last touch: ${ctx.daysSinceLastTouch}`);
  } else {
    lines.push(`Days since last touch: unknown`);
  }
  if (ctx.lastActivities.length > 0) {
    lines.push('Recent activity:');
    for (const a of ctx.lastActivities) lines.push(`- ${a}`);
  } else {
    lines.push('Recent activity: none recorded');
  }
  return ['[SUBJECT CONTEXT]', ...lines, '[/SUBJECT CONTEXT]'].join('\n');
}
