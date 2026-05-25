/**
 * Pure derivation of the action pills on the contact detail page.
 *
 * Same shape as `buildMorningActions`: the page hands in a small bag of
 * facts about the person, this function picks two or three verbs. No
 * configuration. No "let the realtor pick the menu." The state of the
 * person decides.
 *
 * Cap: three actions. Two is normal; three only when there's a clear
 * second axis (e.g. hot person — "send a check-in" AND "schedule a tour").
 *
 * Archived people get nothing — there's nothing useful to do here.
 */

export interface PersonStateForActions {
  /** Lead tier, lowercase. null when the person hasn't been scored. */
  scoreLabel: 'hot' | 'warm' | 'cold' | null;
  /** Days since last touch. null when there's no recorded contact at all. */
  daysQuiet: number | null;
  /** ISO date string of a scheduled follow-up, or null. */
  followUpAt: string | null;
  /** True when the contact was created in the last 14 days. */
  isNew: boolean;
  /** ISO date string when the contact was archived, or null. */
  archivedAt: string | null;
}

export type PeopleDetailActionIntent =
  | 'check-in'
  | 'log-call'
  | 'welcome'
  | 'reach-out'
  | 'schedule-tour';

export interface PeopleDetailAction {
  id: string;
  label: string;
  intent: PeopleDetailActionIntent;
}

/**
 * Decide which 2–3 verb pills appear under the headline.
 *
 * The rules, in order:
 *  - Archived → no actions.
 *  - Has an overdue follow-up (past followUpAt) → "Send a check-in" +
 *    "Clear follow-up". The realtor came here to deal with the overdue.
 *  - New (created in last 14 days) and never contacted → "Welcome them" +
 *    "Log a call".
 *  - Hot → "Send a check-in" + "Schedule a tour". Two axes, not one.
 *  - Cold and quiet 7+ days → "Send a check-in" + "Log a call".
 *  - Warm or anyone else with daysQuiet → "Reach out" + "Log a call".
 *  - No daysQuiet at all (uncontacted, not new) → "Reach out".
 *
 * Order matters: the first action is the headline verb.
 */
export function buildPeopleDetailActions(
  state: PersonStateForActions,
): PeopleDetailAction[] {
  if (state.archivedAt) return [];

  const overdue = isOverdue(state.followUpAt);
  if (overdue) {
    return [
      { id: 'check-in', label: 'Send a check-in', intent: 'check-in' },
      { id: 'clear-followup', label: 'Clear follow-up', intent: 'log-call' },
    ];
  }

  // Brand-new person nobody has touched yet.
  if (state.isNew && state.daysQuiet === null) {
    return [
      { id: 'welcome', label: 'Welcome them', intent: 'welcome' },
      { id: 'log-call', label: 'Log a call', intent: 'log-call' },
    ];
  }

  if (state.scoreLabel === 'hot') {
    return [
      { id: 'check-in', label: 'Send a check-in', intent: 'check-in' },
      { id: 'schedule-tour', label: 'Schedule a tour', intent: 'schedule-tour' },
    ];
  }

  if (state.scoreLabel === 'cold' && (state.daysQuiet ?? 0) >= 7) {
    return [
      { id: 'check-in', label: 'Send a check-in', intent: 'check-in' },
      { id: 'log-call', label: 'Log a call', intent: 'log-call' },
    ];
  }

  // Anyone with a touch history but no other signal — warm, or cold-but-fresh.
  if (state.daysQuiet !== null) {
    return [
      { id: 'reach-out', label: 'Reach out', intent: 'reach-out' },
      { id: 'log-call', label: 'Log a call', intent: 'log-call' },
    ];
  }

  // Uncontacted, not new, not archived. One verb.
  return [{ id: 'reach-out', label: 'Reach out', intent: 'reach-out' }];
}

function isOverdue(followUpAt: string | null): boolean {
  if (!followUpAt) return false;
  const t = Date.parse(followUpAt);
  if (Number.isNaN(t)) return false;
  return t < Date.now();
}
