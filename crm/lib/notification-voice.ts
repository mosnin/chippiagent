/**
 * Chippi voice for in-app notifications.
 *
 * One file, one voice. Every in-app notification string the realtor reads
 * — the bell feed, realtime toasts, broker notifications stored in the
 * database — composes through here so future copy edits live in one place.
 *
 * Voice rules (Jobs lens):
 *   - Name the subject first, proper noun, never "a contact".
 *   - 6-10 words. Direct, calm, present-tense. Past tense for completed events.
 *   - No exclamation marks. No emoji. No second-person ("you have...").
 *   - No future ("you will want to..."), no hypothetical ("you might...").
 *   - The score tier is the temperature; the word "hot" carries it. No flames.
 *   - Configuration is failure to decide — these strings are decided.
 *
 * IMPORTANT: this module composes strings only. It does not deliver SMS or
 * email — the dispatcher in `lib/notify.ts` owns delivery and is intentionally
 * untouched. Inline notification text in routes/components imports these
 * helpers; do not write the prose anywhere else.
 */

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Title-line + supporting line. Matches the existing Notification interface
 * used by the bell dropdown and BrokerNotification rows in the database.
 */
export interface NotificationCopy {
  title: string;
  description: string;
}

/**
 * Format a Date as "10:30am" or "2pm" — short, lowercase meridiem, no
 * trailing zeros on the hour. Used for the inline tour-time mention.
 */
function formatClockTime(d: Date): string {
  const hour = d.getHours();
  const mins = d.getMinutes();
  const meridiem = hour >= 12 ? 'pm' : 'am';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return mins === 0 ? `${hour12}${meridiem}` : `${hour12}:${mins.toString().padStart(2, '0')}${meridiem}`;
}

/**
 * "today", "tomorrow", or a short "Fri" / "Mon Mar 4". Compact enough to
 * fit alongside a time without crowding.
 */
function formatDayWord(d: Date, now: Date = new Date()): string {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays > 1 && diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── New lead ─────────────────────────────────────────────────────────────

/**
 * A single applicant just submitted. Used in realtime toasts where we have
 * a name. The doorway opens to the contact.
 */
export function notificationForNewLead(name: string): string {
  return `${name} just applied. Worth a welcome.`;
}

/**
 * The bell-feed aggregate when the user has unread fresh applications. The
 * count carries the urgency; we don't editorialize beyond that.
 */
export function notificationForNewLeadsCount(count: number): NotificationCopy {
  if (count === 1) {
    return {
      title: '1 new applicant',
      description: 'Worth a welcome.',
    };
  }
  return {
    title: `${count} new applicants`,
    description: 'Worth a welcome.',
  };
}

// ── New lead through brokerage intake (broker-side) ──────────────────────

/**
 * Brokerage intake fed a new lead to the broker dashboard. Stored on
 * BrokerNotification, rendered in the broker bell.
 */
export function notificationForNewBrokerageLead(
  name: string,
  contact: { phone?: string | null; email?: string | null },
): NotificationCopy {
  return {
    title: `${name} just applied through brokerage intake.`,
    description: contact.phone ?? contact.email ?? 'New application submitted.',
  };
}

// ── Lead score crossed hot ───────────────────────────────────────────────

/**
 * The contact's score moved into the hot tier. Past tense — the crossing
 * already happened — but with a present-tense nudge ("now's the moment").
 */
export function notificationForLeadScoredHot(name: string): string {
  return `${name}'s score crossed hot. Now's the moment.`;
}

/**
 * A contact finished scoring at any tier. The realtime toast surfaces
 * this; the tier word does the work.
 */
export function notificationForLeadScored(name: string, scoreLabel: string, leadScore: number): NotificationCopy {
  return {
    title: `${name} just scored ${scoreLabel.toLowerCase()}.`,
    description: `${leadScore}/100`,
  };
}

// ── Tour scheduled ───────────────────────────────────────────────────────

/**
 * A new tour just landed on the calendar. "On the calendar" plants the
 * fact; the address (if present) anchors it in space.
 */
export function notificationForNewTour(
  guestName: string,
  property?: string | null,
): string {
  if (property) {
    return `On the calendar — tour with ${guestName} at ${property}.`;
  }
  return `On the calendar — tour with ${guestName}.`;
}

/**
 * Bell-feed entry for an upcoming tour in the next 24h. The time is the
 * lead fact; address fills the description if we have it. No filler when
 * the address is missing — the title already plants the calendar fact.
 */
export function notificationForUpcomingTour(
  guestName: string,
  startsAt: Date,
  property?: string | null,
  now: Date = new Date(),
): NotificationCopy {
  const day = formatDayWord(startsAt, now);
  const time = formatClockTime(startsAt);
  return {
    title: `Tour with ${guestName} ${day} at ${time}.`,
    description: property ?? '',
  };
}

// ── Tour status changes (confirmed / completed / cancelled / no-show) ────

/**
 * Tour status moved. Past tense for the event, the guest's name first.
 */
export function notificationForTourStatus(
  guestName: string,
  status: 'confirmed' | 'completed' | 'cancelled' | 'no_show',
  property?: string | null,
): NotificationCopy {
  const verbs: Record<typeof status, string> = {
    confirmed: 'is confirmed',
    completed: 'wrapped',
    cancelled: 'fell through',
    no_show: 'was a no-show',
  };
  return {
    title: `${guestName}'s tour ${verbs[status]}.`,
    description: property ?? '',
  };
}

// ── Tours waiting for follow-up ──────────────────────────────────────────

/**
 * Bell-feed entry for completed tours with no deal yet — the realtor
 * walked someone through and never opened a pipeline card.
 */
export function notificationForToursNeedingFollowUp(count: number): NotificationCopy {
  if (count === 1) {
    return {
      title: '1 tour wrapped without a deal.',
      description: 'Worth a check.',
    };
  }
  return {
    title: `${count} tours wrapped without a deal.`,
    description: 'Worth a check.',
  };
}

// ── Follow-up due ────────────────────────────────────────────────────────

/**
 * Bell-feed entry for a follow-up that's hit its date. The slip count
 * tells the realtor how stale this is.
 */
export function notificationForFollowUpDue(
  name: string,
  followUpAt: Date,
  now: Date = new Date(),
): NotificationCopy {
  const day = new Date(followUpAt.getFullYear(), followUpAt.getMonth(), followUpAt.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const slip = Math.floor((today.getTime() - day.getTime()) / 86_400_000);

  if (slip <= 0) {
    return {
      title: `${name}'s follow-up is due.`,
      description: 'On the list for today.',
    };
  }
  if (slip === 1) {
    return {
      title: `${name}'s follow-up slipped 1 day.`,
      description: 'Worth a nudge.',
    };
  }
  return {
    title: `${name}'s follow-up slipped ${slip} days.`,
    description: 'Worth a nudge.',
  };
}

// ── Waitlist ─────────────────────────────────────────────────────────────

/**
 * People are stacked on the tour waitlist — they want a slot we haven't
 * given them. State the fact plainly.
 */
export function notificationForWaitlist(count: number): NotificationCopy {
  if (count === 1) {
    return {
      title: '1 person is still waiting for a tour slot.',
      description: 'Worth opening a window.',
    };
  }
  return {
    title: `${count} people are still waiting for a tour slot.`,
    description: 'Worth opening a window.',
  };
}

// ── Deal events ──────────────────────────────────────────────────────────

/**
 * A new deal just landed in the pipeline. Realtime toast on the dashboard.
 */
export function notificationForNewDeal(title: string, address?: string | null): string {
  if (address) {
    return `Pipeline added: ${title} at ${address}.`;
  }
  return `Pipeline added: ${title}.`;
}

/**
 * A deal moved between stages. The new stage name carries the news.
 */
export function notificationForDealStageMove(dealTitle: string, stageName: string): string {
  return `Pipeline moved: ${dealTitle} is in ${stageName}.`;
}

// ── Brokerage events (broker-only) ───────────────────────────────────────

/**
 * Someone joined the brokerage via the public join code.
 */
export function notificationForMemberJoined(
  identifier: string,
  role: 'broker_admin' | 'realtor_member',
  via: 'join_code' | 'email_invitation',
): NotificationCopy {
  const roleWord = role === 'broker_admin' ? 'Admin' : 'Realtor';
  const verb = via === 'join_code' ? 'joined the brokerage' : 'accepted the invitation';
  return {
    title: `${identifier} ${verb}.`,
    description: roleWord,
  };
}

/**
 * Member left or was removed from the brokerage.
 */
export function notificationForMemberRemoved(identifier: string): NotificationCopy {
  return {
    title: `${identifier} is no longer on the team.`,
    description: '',
  };
}

/**
 * An agent flagged a deal for broker review. The agent's name is the
 * subject; the deal is what they're asking about.
 */
export function notificationForReviewRequested(
  agentName: string,
  dealTitle: string,
  reason?: string | null,
): NotificationCopy {
  return {
    title: `${agentName} flagged ${dealTitle} for review.`,
    description: reason?.slice(0, 280) ?? 'Reason left blank.',
  };
}

/**
 * A deal closed won. Past tense — it already happened — and the brokerage
 * gets the announcement without the marketing veneer.
 */
export function notificationForDealWon(dealTitle: string, agentName?: string | null): NotificationCopy {
  return {
    title: agentName
      ? `${agentName} closed ${dealTitle}.`
      : `${dealTitle} closed.`,
    description: 'Pipeline cleared.',
  };
}

/**
 * A new deal landed on the brokerage radar (broker-side mirror of the
 * agent's pipeline-added toast).
 */
export function notificationForBrokerageDealCreated(
  dealTitle: string,
  agentName?: string | null,
): NotificationCopy {
  return {
    title: agentName
      ? `${agentName} added ${dealTitle} to the pipeline.`
      : `${dealTitle} hit the pipeline.`,
    description: '',
  };
}
