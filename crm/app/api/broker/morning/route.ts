/**
 * GET /api/broker/morning
 *
 * The composed morning story for the /broker home — the broker's mirror of
 * /api/agent/morning. The realtor's morning question is "what's on my desk?";
 * the broker's is "who needs my attention on the team today?" Same shape,
 * different lens: ONE sentence + counts + named subjects + an optional
 * agent-composed override. The composedSentence is null when the agent is
 * disabled, errors, or there's no named subject — the client falls back to
 * the deterministic ladder in lib/broker-morning-story.ts.
 *
 * Auth: broker_owner or broker_admin. Realtor-only members get 403 — they
 * have their own /chippi morning story.
 */
import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getLLMClient, hasLLMKey, openaiModel } from '@/lib/llm';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { dealHealth } from '@/lib/deals/health';
import type {
  BrokerMorningSummary,
  TopPerformerSubject,
  BehindPaceSubject,
  BrokerStuckDealSubject,
} from '@/lib/broker-morning-story';

export interface BrokerMorningResponse extends BrokerMorningSummary {
  /**
   * One-sentence override produced by OpenAI. Null when the agent is
   * disabled, fails, times out, or there's no named subject — the client
   * falls back to the deterministic ladder in lib/broker-morning-story.ts.
   */
  composedSentence: string | null;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const WON_LOOKBACK_DAYS = 7;
const QUIET_THRESHOLD_DAYS = 5;

const AGENT_TIMEOUT_MS = 5_000;
const AGENT_CACHE_TTL_MS = 5 * 60 * 1000;
const AGENT_MODEL = 'gpt-5-mini';

/**
 * Broker prompt — the broker's morning question is about the team, not their
 * own desk. Names a realtor by first name when possible. One sentence. No
 * marketing copy, no preamble.
 */
const BROKER_SYSTEM_PROMPT =
  "You are Chippi, an AI assistant for a real-estate brokerage. The broker's morning question is 'who needs my attention on the team today?' Compose ONE sentence naming the loudest single fact. Voice: warm, direct. Names a realtor by first name when possible. Return only the sentence, nothing else.";

interface AgentCacheEntry {
  sentence: string;
  expiresAt: number;
}
// Per-process cache. Keyed on brokerageId + named-subjects hash so the agent
// only re-fires when the loudest fact actually changes.
const agentCache = new Map<string, AgentCacheEntry>();

function namedSubjectsSignature(s: BrokerMorningSummary): string {
  const sig = {
    perf: s.topPerformer
      ? { id: s.topPerformer.id, count: s.topPerformer.wonCount }
      : null,
    behind: s.behindPaceAgent
      ? { id: s.behindPaceAgent.id, days: s.behindPaceAgent.daysQuiet }
      : null,
    leads: s.unassignedLeadsCount,
    stuck: s.topStuckDeal
      ? { id: s.topStuckDeal.id, days: s.topStuckDeal.daysStuck }
      : null,
  };
  return createHash('sha256').update(JSON.stringify(sig)).digest('hex');
}

function hasNamedSubject(s: BrokerMorningSummary): boolean {
  return Boolean(
    s.topPerformer ||
      s.behindPaceAgent ||
      s.unassignedLeadsCount > 0 ||
      s.topStuckDeal,
  );
}

/**
 * Run OpenAI on the broker summary. Returns null on no-key / no-subject /
 * timeout / error. Never throws.
 */
async function composeBrokerAgentSentence(
  brokerageId: string,
  summary: BrokerMorningSummary,
): Promise<string | null> {
  if (!hasNamedSubject(summary)) return null;
  if (!hasLLMKey()) return null;

  const now = Date.now();
  const sigHash = namedSubjectsSignature(summary);
  const cacheKey = `${brokerageId}:${sigHash}`;
  const cached = agentCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.sentence;

  const client = getLLMClient();
  const userPayload = {
    topPerformer: summary.topPerformer,
    behindPaceAgent: summary.behindPaceAgent,
    unassignedLeadsCount: summary.unassignedLeadsCount,
    topStuckDeal: summary.topStuckDeal,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
  try {
    const response = await client.chat.completions.create(
      {
        model: openaiModel(AGENT_MODEL),
        temperature: 0.5,
        max_tokens: 60,
        messages: [
          { role: 'system', content: BROKER_SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
      },
      { signal: controller.signal },
    );
    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;
    const sentence = raw.replace(/^["'“‘]+|["'”’]+$/g, '').trim();
    if (!sentence) return null;
    agentCache.set(cacheKey, { sentence, expiresAt: now + AGENT_CACHE_TTL_MS });
    return sentence;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { brokerage } = ctx;

  // Resolve the team — realtors in this brokerage and their spaces.
  const members = await getBrokerageMembers(brokerage.id, {
    includeOnboard: true,
  });
  const memberRows = members
    .map((m) => ({
      userId: m.userId,
      name: m.User?.name ?? m.User?.email ?? 'Realtor',
      spaceId: m.Space?.id ?? null,
    }))
    .filter((m) => m.spaceId);

  const spaceIds = memberRows.map((m) => m.spaceId!) as string[];
  const spaceToMember = new Map(
    memberRows.map((m) => [m.spaceId!, { userId: m.userId, name: m.name }]),
  );

  const sevenDaysAgoIso = new Date(Date.now() - WON_LOOKBACK_DAYS * MS_PER_DAY).toISOString();
  const quietCutoffIso = new Date(Date.now() - QUIET_THRESHOLD_DAYS * MS_PER_DAY).toISOString();

  // Aggregate the swarm in one parallel volley. Each query is brokerage-scoped.
  const [wonRowsRes, activeDealRowsRes, unassignedLeadsRes, outboundActivityRes] =
    await Promise.all([
      // Won deals in the last 7 days (per space). Deal has no `wonAt`, so we
      // use updatedAt — accurate enough for "what closed this week."
      spaceIds.length > 0
        ? supabase
            .from('Deal')
            .select('spaceId, updatedAt')
            .in('spaceId', spaceIds)
            .eq('status', 'won')
            .gte('updatedAt', sevenDaysAgoIso)
            .limit(2000)
        : Promise.resolve({ data: [] as Array<{ spaceId: string; updatedAt: string }> }),

      // Active deals across the team — for stuck classification + the
      // longest-stuck subject.
      spaceIds.length > 0
        ? supabase
            .from('Deal')
            .select('id, title, spaceId, updatedAt, closeDate, followUpAt, nextAction, nextActionDueAt')
            .in('spaceId', spaceIds)
            .eq('status', 'active')
            .limit(2000)
        : Promise.resolve({ data: [] }),

      // Unassigned brokerage leads — leads captured via brokerage intake
      // that haven't been routed to a realtor yet. Mirror /broker/leads
      // logic: tagged 'brokerage-lead' AND NOT 'assigned' (the broker
      // assigns leads by adding the 'assigned' tag).
      supabase
        .from('Contact')
        .select('id, tags')
        .eq('brokerageId', brokerage.id)
        .contains('tags', ['brokerage-lead'])
        .limit(2000),

      // Outbound activity — for behind-pace detection. We pull the
      // most-recent outbound activity per space and use the space owner as
      // the proxy for the realtor. 'call' / 'email' / 'meeting' count as
      // outbound; 'note' / 'follow_up' do not (notes are private memory,
      // not contact with the human).
      spaceIds.length > 0
        ? supabase
            .from('ContactActivity')
            .select('spaceId, type, createdAt')
            .in('spaceId', spaceIds)
            .in('type', ['call', 'email', 'meeting'])
            .order('createdAt', { ascending: false })
            .limit(5000)
        : Promise.resolve({ data: [] as Array<{ spaceId: string; type: string; createdAt: string }> }),
    ]);

  // ── Top performer ────────────────────────────────────────────────────────
  const wonBySpace = new Map<string, number>();
  for (const r of (wonRowsRes.data ?? []) as Array<{ spaceId: string }>) {
    wonBySpace.set(r.spaceId, (wonBySpace.get(r.spaceId) ?? 0) + 1);
  }
  let topPerformer: TopPerformerSubject | null = null;
  for (const [spaceId, count] of wonBySpace) {
    const m = spaceToMember.get(spaceId);
    if (!m) continue;
    if (!topPerformer || count > topPerformer.wonCount) {
      topPerformer = { id: m.userId, name: m.name, wonCount: count };
    }
  }

  // ── Behind-pace agent ────────────────────────────────────────────────────
  // Pick the most-recent outbound timestamp per space; the realtor whose
  // most-recent outbound is older than the quiet threshold (or who has zero
  // outbound rows) is "behind pace." If multiple qualify, pick the quietest
  // (longest gap) — that's the loudest signal.
  const lastOutboundBySpace = new Map<string, Date>();
  for (const r of (outboundActivityRes.data ?? []) as Array<{
    spaceId: string;
    createdAt: string;
  }>) {
    const ts = new Date(r.createdAt);
    if (isNaN(ts.getTime())) continue;
    const prev = lastOutboundBySpace.get(r.spaceId);
    if (!prev || ts > prev) lastOutboundBySpace.set(r.spaceId, ts);
  }
  const quietCutoff = new Date(quietCutoffIso);
  const nowTs = Date.now();
  let behindPaceAgent: BehindPaceSubject | null = null;
  for (const m of memberRows) {
    if (!m.spaceId) continue;
    const last = lastOutboundBySpace.get(m.spaceId);
    // Quiet means: no outbound at all, OR last outbound is older than the
    // cutoff.
    const isQuiet = !last || last < quietCutoff;
    if (!isQuiet) continue;
    const daysQuiet = last
      ? Math.max(0, Math.floor((nowTs - last.getTime()) / MS_PER_DAY))
      : QUIET_THRESHOLD_DAYS;
    if (!behindPaceAgent || daysQuiet > behindPaceAgent.daysQuiet) {
      behindPaceAgent = { id: m.userId, name: m.name, daysQuiet };
    }
  }

  // ── Unassigned leads count ───────────────────────────────────────────────
  const unassignedLeadsCount = (
    (unassignedLeadsRes.data ?? []) as Array<{ tags: string[] | null }>
  ).filter((c) => !(c.tags ?? []).includes('assigned')).length;

  // ── Stuck deals across the team ──────────────────────────────────────────
  const activeDeals = (activeDealRowsRes.data ?? []) as Array<{
    id: string;
    title: string;
    spaceId: string;
    updatedAt: string | null;
    closeDate: string | null;
    followUpAt: string | null;
    nextAction: string | null;
    nextActionDueAt: string | null;
  }>;
  let stuckDealsCount = 0;
  let topStuckDeal: BrokerStuckDealSubject | null = null;
  for (const d of activeDeals) {
    const updated = d.updatedAt ? new Date(d.updatedAt) : new Date();
    const health = dealHealth({
      status: 'active',
      updatedAt: updated as unknown as Date,
      closeDate: d.closeDate as unknown as Date | null,
      followUpAt: d.followUpAt as unknown as Date | null,
      nextAction: d.nextAction,
      nextActionDueAt: d.nextActionDueAt as unknown as Date | null,
    });
    if (health.state === 'stuck') {
      stuckDealsCount += 1;
      const days = Math.max(0, Math.floor((nowTs - updated.getTime()) / MS_PER_DAY));
      if (!topStuckDeal || days > topStuckDeal.daysStuck) {
        topStuckDeal = { id: d.id, title: d.title, daysStuck: days };
      }
    }
  }

  const summary: BrokerMorningSummary = {
    topPerformer,
    behindPaceAgent,
    unassignedLeadsCount,
    stuckDealsCount,
    topStuckDeal,
  };

  const composedSentence = await composeBrokerAgentSentence(brokerage.id, summary);
  const response: BrokerMorningResponse = { ...summary, composedSentence };
  return NextResponse.json(response);
}
