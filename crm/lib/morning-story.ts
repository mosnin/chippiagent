/**
 * Pure composition logic for the /chippi home story.
 *
 * Lives separately from <MorningStory /> so the brand voice can be
 * snapshot-tested without spinning up React. The home is the deepest
 * surface in the app — its sentence names a *subject*, not just a count.
 * "The Chen deal hasn't moved in 14 days" beats "1 deal is stuck"; same
 * data, real information.
 *
 * Doorway is multi-target: a stuck-deal sentence opens to that deal, an
 * overdue-follow-up sentence opens to that person. The doorway always
 * matches the subject of the sentence — no more single-target naive logic.
 */
import type { MorningSummary } from '@/app/api/agent/morning/route';

export type MorningDoorway =
  | { kind: 'person'; id: string }
  | { kind: 'deal'; id: string };

export interface MorningStoryOutput {
  text: string;
  doorway: MorningDoorway | null;
}

/**
 * Deal titles in the wild can be messy: "Smith — buyer, $700k Sunset Strip"
 * breaks the cadence of "The {title} deal hasn't moved...". When the title
 * has internal punctuation or runs long, fall back to a clean generic
 * subject. The doorway still opens the right deal.
 */
function isCleanDealTitle(title: string): boolean {
  if (title.length > 32) return false;
  if (/[—–\-,()|:;]/.test(title)) return false;
  return true;
}

/**
 * Internal: build the ordered list of named-subject candidates from the
 * summary. The "Next" pill on the home cycles through these — they're the
 * tiers that name a person or deal. Count-only tiers (drafts, closing,
 * all-clear) live in the tail and aren't cycled — there's no subject to
 * cycle to.
 *
 * Order matches the priority ladder: stuck > overdue > hot > new.
 */
type NamedCandidate = { text: string; doorway: MorningDoorway };

function namedCandidates(s: MorningSummary): NamedCandidate[] {
  const out: NamedCandidate[] = [];

  if (s.topStuckDeal) {
    const { title, daysStuck, id } = s.topStuckDeal;
    const subject = isCleanDealTitle(title) ? `The ${title} deal` : 'A deal';
    const text = daysStuck > 0
      ? `${subject} hasn't moved in ${daysStuck} day${daysStuck === 1 ? '' : 's'}.`
      : `${subject} is stuck.`;
    out.push({ text, doorway: { kind: 'deal', id } });
  }

  if (s.topOverdueFollowUp) {
    const { name, daysOverdue, id } = s.topOverdueFollowUp;
    const text = daysOverdue === 0
      ? `${name}'s follow-up is due today.`
      : daysOverdue === 1
        ? `${name}'s follow-up is 1 day overdue.`
        : `${name}'s follow-up is ${daysOverdue} days overdue.`;
    out.push({ text, doorway: { kind: 'person', id } });
  }

  if (s.topHotPerson) {
    const { name, id } = s.topHotPerson;
    out.push({ text: `${name}'s score is hot. Reach out.`, doorway: { kind: 'person', id } });
  }

  if (s.topNewPerson) {
    const { name, id } = s.topNewPerson;
    out.push({ text: `${name} just applied. Welcome them.`, doorway: { kind: 'person', id } });
  }

  return out;
}

/**
 * How many named subjects this summary can speak to. The home uses this to
 * decide whether the "Next" pill should render at all — pill is invisible
 * unless there's actually a next subject to cycle to.
 */
export function countMorningCandidates(s: MorningSummary): number {
  return namedCandidates(s).length;
}

/**
 * Compose one sentence from the summary. Priority order:
 *   1. Stuck deal — name the longest-stuck one.
 *   2. Overdue follow-up — name the most-overdue person.
 *   3. Hot person — name the highest-scoring one.
 *   4. New person — name the most-recent arrival.
 *   5. Drafts/questions — count only (focus card is right below).
 *   6. Closing this week — count only.
 *   7. Nothing pressing — calm, present-tense, declarative.
 *
 * Hot beats new because hot is *measured* intent (leadScore >= threshold),
 * and that intent rots if the realtor goes quiet. New is just an arrival —
 * no signal yet beyond the timestamp. When both are present, the right
 * morning move is the lead whose interest is actively cooling, not the
 * freshest face in the inbox.
 *
 * The doorway always matches the subject of the sentence: the stuck-deal
 * sentence opens to that deal; the overdue-follow-up sentence opens to
 * that person; hot + new sentences open to that person.
 *
 * `agentSentence` (optional): when the route's OpenAI compose succeeds, the
 * model's sentence overrides the ladder text. The doorway is *still* derived
 * deterministically from the summary's named subjects — we don't trust the
 * model with navigation. Empty/whitespace strings are ignored (treated as
 * "agent didn't produce anything").
 *
 * `opts.skip` (default 0): with 47 hot leads, the realtor would see the same
 * face every morning until they touch it — the single decision becomes
 * nagging. The home renders a "Next" pill that increments skip in-memory so
 * the realtor can cycle to the next-best subject in one tap. skip=0 picks
 * the top of the ladder (default behavior — non-interactive callers stay
 * unchanged). skip=1 picks the second-highest named subject. When skip
 * exceeds the available named candidates we fall through to the count-only
 * tail tiers (drafts/closing/all-clear), which have no subject to cycle.
 */
export function composeMorningStory(
  s: MorningSummary,
  agentSentence?: string | null,
  opts?: { skip?: number },
): MorningStoryOutput {
  const override =
    typeof agentSentence === 'string' && agentSentence.trim().length > 0
      ? agentSentence.trim()
      : null;

  const skip = Math.max(0, Math.floor(opts?.skip ?? 0));
  const candidates = namedCandidates(s);

  // skip=0 is the unchanged default. The agent sentence override only applies
  // to the head of the ladder — it was composed for that specific subject.
  // Cycling past skip=0 means we're showing a different subject; the model's
  // line for the original subject would be wrong, so fall back to the
  // deterministic copy.
  if (skip < candidates.length) {
    const pick = candidates[skip]!;
    const text = skip === 0 && override ? override : pick.text;
    return { text, doorway: pick.doorway };
  }

  // Drafts + questions live in the FocusCard right below — sentence names
  // them, no doorway needed (the card is on the same screen).
  if (s.draftsCount > 0 || s.questionsCount > 0) {
    const parts: string[] = [];
    if (s.draftsCount > 0) parts.push(`${s.draftsCount} draft${s.draftsCount === 1 ? '' : 's'}`);
    if (s.questionsCount > 0) parts.push(`${s.questionsCount} question${s.questionsCount === 1 ? '' : 's'}`);
    return { text: `${parts.join(' · ')} waiting for you.`, doorway: null };
  }

  if (s.closingThisWeekCount > 0) {
    return {
      text: s.closingThisWeekCount === 1
        ? '1 deal closing this week. Keep it on track.'
        : `${s.closingThisWeekCount} deals closing this week. Keep them on track.`,
      doorway: null,
    };
  }

  return {
    text: "Nothing pressing. I'm watching the pipeline.",
    doorway: null,
  };
}
