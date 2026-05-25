/**
 * Pure composition for the /broker home story.
 *
 * Mirrors lib/morning-story.ts but for the broker's question — "who needs my
 * attention on the team today?" Names a realtor by first name when the
 * loudest fact has a person on it. Doorway opens straight to that realtor
 * (or to the leads queue when the loudest fact is unassigned leads).
 *
 * Lives outside the route so the brand voice is snapshot-testable without
 * spinning up Supabase.
 */

export interface RealtorSubject {
  id: string;
  name: string;
}

export interface TopPerformerSubject extends RealtorSubject {
  /** Won deals in the last 7 days. */
  wonCount: number;
}

export interface BehindPaceSubject extends RealtorSubject {
  /** Days since last outbound contact activity. */
  daysQuiet: number;
}

export interface BrokerStuckDealSubject {
  id: string;
  title: string;
  daysStuck: number;
}

export interface BrokerMorningSummary {
  topPerformer: TopPerformerSubject | null;
  behindPaceAgent: BehindPaceSubject | null;
  unassignedLeadsCount: number;
  /** Active deals classified as 'stuck' across the whole team. */
  stuckDealsCount: number;
  topStuckDeal: BrokerStuckDealSubject | null;
}

export type BrokerDoorway =
  | { kind: 'realtor'; id: string }
  | { kind: 'leads' }
  | null;

export interface BrokerMorningStoryOutput {
  text: string;
  doorway: BrokerDoorway;
}

/** First name only — broker speaks about realtors the way they actually call them. */
function firstName(full: string): string {
  const trimmed = full.trim();
  if (!trimmed) return 'Someone';
  return trimmed.split(/\s+/)[0];
}

/**
 * Compose the broker's one sentence. Priority order:
 *   1. Top performer — celebrate first; brokers want to know who's hot.
 *   2. Behind-pace agent — the realtor who's gone silent.
 *   3. Unassigned leads — "route them."
 *   4. Stuck deals across the team — pulse check.
 *   5. All-clear — quiet team week.
 *
 * Doorway always matches the subject. The model's text (if provided) wins
 * over the ladder, but the doorway is always derived deterministically — we
 * do not let the model pick navigation.
 */
export function composeBrokerMorningStory(
  s: BrokerMorningSummary,
  agentSentence?: string | null,
): BrokerMorningStoryOutput {
  const override =
    typeof agentSentence === 'string' && agentSentence.trim().length > 0
      ? agentSentence.trim()
      : null;

  if (s.topPerformer && s.topPerformer.wonCount > 0) {
    const { id, name, wonCount } = s.topPerformer;
    const fn = firstName(name);
    const dealWord = wonCount === 1 ? 'deal' : 'deals';
    return {
      text: override ?? `${fn} led the team last week — ${wonCount} ${dealWord} closed.`,
      doorway: { kind: 'realtor', id },
    };
  }

  if (s.behindPaceAgent) {
    const { id, name, daysQuiet } = s.behindPaceAgent;
    const fn = firstName(name);
    const dayWord = daysQuiet === 1 ? 'day' : 'days';
    return {
      text:
        override
        ?? (daysQuiet <= 0
          ? `${fn}'s behind pace — no outbound today.`
          : `${fn}'s behind pace — 0 calls in ${daysQuiet} ${dayWord}.`),
      doorway: { kind: 'realtor', id },
    };
  }

  if (s.unassignedLeadsCount > 0) {
    const n = s.unassignedLeadsCount;
    const leadWord = n === 1 ? 'lead' : 'leads';
    return {
      text: override ?? `${n} new ${leadWord} landed unassigned. Route them.`,
      doorway: { kind: 'leads' },
    };
  }

  if (s.stuckDealsCount > 0 && s.topStuckDeal) {
    const { daysStuck } = s.topStuckDeal;
    const dayWord = daysStuck === 1 ? 'day' : 'days';
    const text =
      override
      ?? (s.stuckDealsCount === 1
        ? daysStuck > 0
          ? `1 deal on the team has been stuck for ${daysStuck} ${dayWord}.`
          : `1 deal on the team is stuck.`
        : daysStuck > 0
          ? `${s.stuckDealsCount} deals stuck across the team — longest at ${daysStuck} ${dayWord}.`
          : `${s.stuckDealsCount} deals stuck across the team.`);
    return { text, doorway: null };
  }

  return {
    text: "Quiet team week. Pipeline's healthy.",
    doorway: null,
  };
}
