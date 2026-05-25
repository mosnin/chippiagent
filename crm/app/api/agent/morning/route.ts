/**
 * GET /api/agent/morning
 *
 * The composed morning story for the /chippi home. Returns counts AND named
 * subjects so the brand voice can say "The Chen deal hasn't moved in 14
 * days" instead of just "1 deal is stuck." Specific over generic. Names
 * over counts. The home's job is to be the deepest surface, not the
 * shallowest.
 *
 * Different from /api/agent/today (which lists items for the dispatch
 * console) and /api/agent/priority (which returns curated PRIORITY_LIST
 * picks). This one is a tight summary feed used by the home greeting only:
 * one fetch, one shape, one sentence.
 *
 * Realtor space only — brokerage-routed contacts (brokerageId !== null) are
 * excluded so the realtor's morning briefing reflects what's on _their_
 * desk, not what's been routed past them.
 */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { dealHealth } from '@/lib/deals/health';
import { HOT_LEAD_THRESHOLD } from '@/lib/constants';
import { composeAgentSentence } from '@/lib/morning-story-agent';

/** A deal that's gone quiet long enough to have a name on the home. */
export interface StuckDealSubject {
  id: string;
  title: string;
  daysStuck: number;
}

/** A person whose follow-up date has slipped. */
export interface OverduePersonSubject {
  id: string;
  name: string;
  daysOverdue: number;
}

/** A person with a name attached — used for new arrivals + hot picks. */
export interface NamedPerson {
  id: string;
  name: string;
}

export interface MorningResponse extends MorningSummary {
  /**
   * One-sentence override produced by the agent. Null when the agent is
   * disabled, fails, times out, or there's no named subject — the client
   * falls back to the deterministic ladder in `lib/morning-story.ts`.
   */
  composedSentence: string | null;
}

export interface MorningSummary {
  /** Contacts tagged 'new-lead' (haven't been viewed yet). */
  newPeopleCount: number;
  /** Contacts whose leadScore >= HOT_LEAD_THRESHOLD. */
  hotPeopleCount: number;
  /** Contact follow-ups that are past their date. */
  overdueFollowUpsCount: number;
  /** Active deals classified as 'stuck' by dealHealth. */
  stuckDealsCount: number;
  /** Active deals with a closeDate inside the next 7 days. */
  closingThisWeekCount: number;
  /** Pending agent drafts. */
  draftsCount: number;
  /** Pending agent questions. */
  questionsCount: number;

  // Named subjects — these are what the brand voice actually says out loud.
  // The compose function leads with the loudest one and names it specifically.

  /** The deal that's been stuck the longest, if any. */
  topStuckDeal: StuckDealSubject | null;
  /** The person whose follow-up has slipped the furthest, if any. */
  topOverdueFollowUp: OverduePersonSubject | null;
  /** The most-recently-arrived new applicant, if any. */
  topNewPerson: NamedPerson | null;
  /** The hottest unworked person (highest leadScore at or above HOT), if any. */
  topHotPerson: NamedPerson | null;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const nowIso = new Date().toISOString();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekOut = new Date(today);
  weekOut.setDate(weekOut.getDate() + 7);

  const [
    newPeopleRes,
    hotPeopleRes,
    overdueFollowUpsRes,
    activeDealsRes,
    draftsRes,
    questionsRes,
    topNewPersonRes,
    topHotPersonRes,
    topOverdueRes,
  ] = await Promise.all([
    // ── Counts ─────────────────────────────────────────────────────────────
    supabase
      .from('Contact')
      .select('id', { count: 'exact', head: true })
      .eq('spaceId', space.id)
      .is('brokerageId', null)
      .contains('tags', ['new-lead']),
    supabase
      .from('Contact')
      .select('id', { count: 'exact', head: true })
      .eq('spaceId', space.id)
      .is('brokerageId', null)
      .gte('leadScore', HOT_LEAD_THRESHOLD),
    supabase
      .from('Contact')
      .select('id', { count: 'exact', head: true })
      .eq('spaceId', space.id)
      .is('brokerageId', null)
      .not('followUpAt', 'is', null)
      .lt('followUpAt', nowIso),

    // ── Active deals (full read so we can classify health AND pick the
    //    longest-stuck one) ──────────────────────────────────────────────
    supabase
      .from('Deal')
      .select('id, title, status, updatedAt, closeDate, followUpAt, nextAction, nextActionDueAt')
      .eq('spaceId', space.id)
      .eq('status', 'active')
      .limit(500),

    // ── Counts continued ──────────────────────────────────────────────────
    supabase
      .from('AgentDraft')
      .select('id', { count: 'exact', head: true })
      .eq('spaceId', space.id)
      .eq('status', 'pending'),
    supabase
      .from('AgentQuestion')
      .select('id', { count: 'exact', head: true })
      .eq('spaceId', space.id)
      .eq('status', 'pending'),

    // ── Named subjects (1 row each — light reads) ─────────────────────────
    // Most-recent new applicant.
    supabase
      .from('Contact')
      .select('id, name')
      .eq('spaceId', space.id)
      .is('brokerageId', null)
      .contains('tags', ['new-lead'])
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Hottest contact (highest score above threshold).
    supabase
      .from('Contact')
      .select('id, name')
      .eq('spaceId', space.id)
      .is('brokerageId', null)
      .gte('leadScore', HOT_LEAD_THRESHOLD)
      .order('leadScore', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Person with the most-overdue follow-up.
    supabase
      .from('Contact')
      .select('id, name, followUpAt')
      .eq('spaceId', space.id)
      .is('brokerageId', null)
      .not('followUpAt', 'is', null)
      .lt('followUpAt', nowIso)
      .order('followUpAt', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  // Classify deal health — both for the count and to find the longest-stuck.
  const activeDeals = (activeDealsRes.data ?? []) as Array<{
    id: string;
    title: string;
    status: string;
    updatedAt: string | null;
    closeDate: string | null;
    followUpAt: string | null;
    nextAction: string | null;
    nextActionDueAt: string | null;
  }>;
  let stuckDealsCount = 0;
  let closingThisWeekCount = 0;
  let topStuckDeal: StuckDealSubject | null = null;
  const nowDate = new Date();
  for (const d of activeDeals) {
    const updated = d.updatedAt ? new Date(d.updatedAt) : nowDate;
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
      const days = Math.max(0, Math.floor((nowDate.getTime() - updated.getTime()) / MS_PER_DAY));
      if (!topStuckDeal || days > topStuckDeal.daysStuck) {
        topStuckDeal = { id: d.id, title: d.title, daysStuck: days };
      }
    }
    if (d.closeDate) {
      const close = new Date(d.closeDate);
      if (!isNaN(close.getTime()) && close >= today && close <= weekOut) {
        closingThisWeekCount += 1;
      }
    }
  }

  // Named-subject extraction from the maybeSingle reads.
  function namedFrom(row: unknown): NamedPerson | null {
    if (!row || typeof row !== 'object') return null;
    const r = row as { id?: unknown; name?: unknown };
    if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
    return { id: r.id, name: r.name };
  }
  const topNewPerson = namedFrom(topNewPersonRes.data);
  const topHotPerson = namedFrom(topHotPersonRes.data);

  let topOverdueFollowUp: OverduePersonSubject | null = null;
  if (topOverdueRes.data) {
    const r = topOverdueRes.data as { id?: unknown; name?: unknown; followUpAt?: unknown };
    if (typeof r.id === 'string' && typeof r.name === 'string' && typeof r.followUpAt === 'string') {
      const due = new Date(r.followUpAt);
      const days = Math.max(0, Math.floor((nowDate.getTime() - due.getTime()) / MS_PER_DAY));
      topOverdueFollowUp = { id: r.id, name: r.name, daysOverdue: days };
    }
  }

  const summary: MorningSummary = {
    newPeopleCount: newPeopleRes.count ?? 0,
    hotPeopleCount: hotPeopleRes.count ?? 0,
    overdueFollowUpsCount: overdueFollowUpsRes.count ?? 0,
    stuckDealsCount,
    closingThisWeekCount,
    draftsCount: draftsRes.count ?? 0,
    questionsCount: questionsRes.count ?? 0,
    topStuckDeal,
    topOverdueFollowUp,
    topNewPerson,
    topHotPerson,
  };

  // Agent compose runs on top of the deterministic summary. If it returns
  // null (no key, no named subject, timeout, error), the client falls back
  // to the hand-coded ladder. The home never blocks on it.
  const composedSentence = await composeAgentSentence(space.id, summary);

  const response: MorningResponse = { ...summary, composedSentence };
  return NextResponse.json(response);
}
