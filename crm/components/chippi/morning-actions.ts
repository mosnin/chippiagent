/**
 * Pure derivation of the inline action panel for <MorningStory />.
 *
 * The home doorway used to teleport: tap the sentence, get yanked to a
 * detail page. That's the home behaving like a chooser. Real workspace
 * surfaces fire a verb: tap the sentence, the work surfaces underneath.
 *
 * Phase 7 update — compose actions no longer carry a chat-prefill URL.
 * They carry an `intent` (and the deal/person context they apply to), so
 * the home can fire a draft-and-send flow inline instead of teleporting
 * the realtor into the chat to type the same thing again. The `navigate`
 * actions still carry an `href`; "Open the deal" / "Open the person" is a
 * link, full stop.
 *
 * Two actions for people, three for deals. No config; the realtor doesn't
 * pick the menu — the menu picks itself from the sentence.
 */
import type { MorningSummary } from '@/app/api/agent/morning/route';
import type { MorningDoorway } from '@/lib/morning-story';

export type MorningActionKind = 'compose' | 'navigate';

/** What the inline draft endpoint should compose for a tap. */
export type MorningActionIntent = 'check-in' | 'log-call' | 'welcome' | 'reach-out';

/** Subject context attached to a compose action so the endpoint has what it needs. */
export interface MorningActionContext {
  kind: 'deal' | 'person';
  id: string;
  /** Display name/title for fallback copy in the inline preview header. */
  label: string;
}

interface ComposeAction {
  id: string;
  label: string;
  kind: 'compose';
  intent: MorningActionIntent;
  context: MorningActionContext;
}

interface NavigateAction {
  id: string;
  label: string;
  kind: 'navigate';
  href: string;
}

export type MorningAction = ComposeAction | NavigateAction;

/**
 * Build the inline panel for a given doorway. The summary is needed to
 * fill in concrete subjects (the deal title, the person's name) — the
 * doorway alone only carries an id. When the doorway is null (drafts /
 * questions / closing-this-week / all-clear), the panel is empty and the
 * sentence stays non-interactive, exactly as it ships today.
 */
export function buildMorningActions(
  doorway: MorningDoorway | null,
  summary: MorningSummary,
  slug: string,
): MorningAction[] {
  if (!doorway) return [];

  if (doorway.kind === 'deal') {
    const stuck = summary.topStuckDeal;
    const title = stuck?.title ?? 'this deal';
    const ctx: MorningActionContext = { kind: 'deal', id: doorway.id, label: title };
    return [
      { id: 'deal-checkin', label: 'Send a check-in', kind: 'compose', intent: 'check-in', context: ctx },
      { id: 'deal-log-call', label: 'Log a call', kind: 'compose', intent: 'log-call', context: ctx },
      { id: 'deal-open', label: 'Open the deal', kind: 'navigate', href: `/s/${slug}/deals/${doorway.id}` },
    ];
  }

  // doorway.kind === 'person'. We pick the simpler menu — two buttons, no
  // sub-kind branching. The sentence itself has already named the person;
  // the verbs apply whether they're new, hot, or overdue.
  //
  // The doorway can land on ANY of the three named-person tiers (overdue,
  // hot, new) depending on which the home is currently showing — including
  // when the "Next" pill cycles past the top tier. Match the doorway id
  // against each named subject so the label and intent track the actual
  // shown subject, not the highest-priority one. Intent is 'welcome' only
  // when the doorway specifically lands on the new-arrival subject; every
  // other person doorway is 'reach-out'.
  const candidates: Array<{ id: string; name: string; isNew: boolean } | null> = [
    summary.topOverdueFollowUp
      ? { id: summary.topOverdueFollowUp.id, name: summary.topOverdueFollowUp.name, isNew: false }
      : null,
    summary.topHotPerson
      ? { id: summary.topHotPerson.id, name: summary.topHotPerson.name, isNew: false }
      : null,
    summary.topNewPerson
      ? { id: summary.topNewPerson.id, name: summary.topNewPerson.name, isNew: true }
      : null,
  ];
  const matched = candidates.find((c) => c !== null && c.id === doorway.id) ?? null;
  const name = matched?.name ?? 'them';
  const intent: MorningActionIntent = matched?.isNew ? 'welcome' : 'reach-out';
  const ctx: MorningActionContext = { kind: 'person', id: doorway.id, label: name };
  return [
    { id: 'person-checkin', label: 'Send a check-in', kind: 'compose', intent, context: ctx },
    { id: 'person-open', label: 'Open the person', kind: 'navigate', href: `/s/${slug}/contacts/${doorway.id}` },
  ];
}
