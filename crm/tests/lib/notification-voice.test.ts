import { describe, it, expect } from 'vitest';
import {
  notificationForNewLead,
  notificationForNewLeadsCount,
  notificationForNewBrokerageLead,
  notificationForLeadScoredHot,
  notificationForLeadScored,
  notificationForNewTour,
  notificationForUpcomingTour,
  notificationForTourStatus,
  notificationForToursNeedingFollowUp,
  notificationForFollowUpDue,
  notificationForWaitlist,
  notificationForNewDeal,
  notificationForDealStageMove,
  notificationForMemberJoined,
  notificationForMemberRemoved,
  notificationForReviewRequested,
  notificationForDealWon,
  notificationForBrokerageDealCreated,
} from '@/lib/notification-voice';

describe('notification-voice — new lead', () => {
  it('names the applicant first and frames as a welcome', () => {
    expect(notificationForNewLead('Jane Chen')).toBe('Jane Chen just applied. Worth a welcome.');
  });

  it('aggregates the bell-feed count to a calm fact', () => {
    expect(notificationForNewLeadsCount(1)).toEqual({
      title: '1 new applicant',
      description: 'Worth a welcome.',
    });
    expect(notificationForNewLeadsCount(4)).toEqual({
      title: '4 new applicants',
      description: 'Worth a welcome.',
    });
  });

  it('names a brokerage-intake lead with the source', () => {
    expect(
      notificationForNewBrokerageLead('Maya Rivera', { phone: '555-0100', email: null }),
    ).toEqual({
      title: 'Maya Rivera just applied through brokerage intake.',
      description: '555-0100',
    });
  });
});

describe('notification-voice — lead scoring', () => {
  it('marks a hot crossing as the moment, not a notification of fact', () => {
    expect(notificationForLeadScoredHot('Sam Chen')).toBe(
      "Sam Chen's score crossed hot. Now's the moment.",
    );
  });

  it('states the tier plainly for warm/cold scoring events', () => {
    expect(notificationForLeadScored('Sam Chen', 'WARM', 62)).toEqual({
      title: 'Sam Chen just scored warm.',
      description: '62/100',
    });
  });
});

describe('notification-voice — tours', () => {
  it('puts a new tour on the calendar with the property', () => {
    expect(notificationForNewTour('Sam Chen', '412 Elm')).toBe(
      'On the calendar — tour with Sam Chen at 412 Elm.',
    );
  });

  it('drops the property gracefully when none is provided', () => {
    expect(notificationForNewTour('Sam Chen', null)).toBe(
      'On the calendar — tour with Sam Chen.',
    );
  });

  it('names upcoming tours with day + time + property', () => {
    const now = new Date('2026-05-01T08:00:00');
    const tomorrowAt2 = new Date('2026-05-02T14:00:00');
    expect(notificationForUpcomingTour('Jane Chen', tomorrowAt2, '412 Elm', now)).toEqual({
      title: 'Tour with Jane Chen tomorrow at 2pm.',
      description: '412 Elm',
    });
  });

  it('drops the description filler when the property is missing', () => {
    const now = new Date('2026-05-01T08:00:00');
    const tomorrowAt2 = new Date('2026-05-02T14:00:00');
    expect(notificationForUpcomingTour('Jane Chen', tomorrowAt2, null, now)).toEqual({
      title: 'Tour with Jane Chen tomorrow at 2pm.',
      description: '',
    });
  });

  it('past-tenses tour status changes with the right verb per status', () => {
    expect(notificationForTourStatus('Sam Chen', 'confirmed', '412 Elm')).toEqual({
      title: "Sam Chen's tour is confirmed.",
      description: '412 Elm',
    });
    expect(notificationForTourStatus('Sam Chen', 'completed', null)).toEqual({
      title: "Sam Chen's tour wrapped.",
      description: '',
    });
    expect(notificationForTourStatus('Sam Chen', 'cancelled', null)).toEqual({
      title: "Sam Chen's tour fell through.",
      description: '',
    });
    expect(notificationForTourStatus('Sam Chen', 'no_show', null)).toEqual({
      title: "Sam Chen's tour was a no-show.",
      description: '',
    });
  });

  it('flags wrapped-but-no-deal tours as worth a check', () => {
    expect(notificationForToursNeedingFollowUp(1)).toEqual({
      title: '1 tour wrapped without a deal.',
      description: 'Worth a check.',
    });
    expect(notificationForToursNeedingFollowUp(3)).toEqual({
      title: '3 tours wrapped without a deal.',
      description: 'Worth a check.',
    });
  });
});

describe('notification-voice — follow-ups', () => {
  it('says "due" when the follow-up just hit today', () => {
    const now = new Date('2026-05-01T15:00:00');
    const today = new Date('2026-05-01T09:00:00');
    expect(notificationForFollowUpDue('Maya Rivera', today, now)).toEqual({
      title: "Maya Rivera's follow-up is due.",
      description: 'On the list for today.',
    });
  });

  it('counts the slip in days when overdue, plural-aware', () => {
    const now = new Date('2026-05-03T09:00:00');
    const twoDaysAgo = new Date('2026-05-01T09:00:00');
    expect(notificationForFollowUpDue('Maya Rivera', twoDaysAgo, now)).toEqual({
      title: "Maya Rivera's follow-up slipped 2 days.",
      description: 'Worth a nudge.',
    });

    const oneDayAgo = new Date('2026-05-02T09:00:00');
    expect(notificationForFollowUpDue('Maya Rivera', oneDayAgo, now)).toEqual({
      title: "Maya Rivera's follow-up slipped 1 day.",
      description: 'Worth a nudge.',
    });
  });
});

describe('notification-voice — waitlist + deals', () => {
  it('states the waitlist as a fact, not a complaint', () => {
    expect(notificationForWaitlist(1)).toEqual({
      title: '1 person is still waiting for a tour slot.',
      description: 'Worth opening a window.',
    });
    expect(notificationForWaitlist(3)).toEqual({
      title: '3 people are still waiting for a tour slot.',
      description: 'Worth opening a window.',
    });
  });

  it('frames a new deal as pipeline movement', () => {
    expect(notificationForNewDeal('41 Sunset', null)).toBe('Pipeline added: 41 Sunset.');
    expect(notificationForNewDeal('Smith Deal', '412 Elm')).toBe(
      'Pipeline added: Smith Deal at 412 Elm.',
    );
  });

  it('names the deal and the destination stage on a stage move', () => {
    expect(notificationForDealStageMove('41 Sunset', 'Closing')).toBe(
      'Pipeline moved: 41 Sunset is in Closing.',
    );
  });
});

describe('notification-voice — brokerage events', () => {
  it('uses "joined" for join-code, "accepted the invitation" for email', () => {
    expect(notificationForMemberJoined('alice@x.com', 'realtor_member', 'join_code')).toEqual({
      title: 'alice@x.com joined the brokerage.',
      description: 'Realtor',
    });
    expect(
      notificationForMemberJoined('alice@x.com', 'broker_admin', 'email_invitation'),
    ).toEqual({
      title: 'alice@x.com accepted the invitation.',
      description: 'Admin',
    });
  });

  it('frames removal as a fact without drama', () => {
    expect(notificationForMemberRemoved('alice@x.com')).toEqual({
      title: 'alice@x.com is no longer on the team.',
      description: '',
    });
  });

  it('names the agent and the deal on a review request', () => {
    expect(notificationForReviewRequested('Alice', 'Smith Deal', 'Need a second look at terms.')).toEqual({
      title: 'Alice flagged Smith Deal for review.',
      description: 'Need a second look at terms.',
    });
  });

  it('past-tenses a deal close with the agent name when present', () => {
    expect(notificationForDealWon('41 Sunset', 'Alice')).toEqual({
      title: 'Alice closed 41 Sunset.',
      description: 'Pipeline cleared.',
    });
    expect(notificationForDealWon('41 Sunset', null)).toEqual({
      title: '41 Sunset closed.',
      description: 'Pipeline cleared.',
    });
  });

  it('frames a brokerage-side new deal as agent-named pipeline movement', () => {
    expect(notificationForBrokerageDealCreated('41 Sunset', 'Alice')).toEqual({
      title: 'Alice added 41 Sunset to the pipeline.',
      description: '',
    });
    expect(notificationForBrokerageDealCreated('41 Sunset', null)).toEqual({
      title: '41 Sunset hit the pipeline.',
      description: '',
    });
  });
});

describe('notification-voice — voice constraints (regression suite)', () => {
  // Jobs lens: every sentence must pass these. If a sentence ever sneaks
  // in an exclamation mark or "you have...", the build catches it.
  const allSentences: string[] = [
    notificationForNewLead('Jane Chen'),
    notificationForNewLeadsCount(1).title,
    notificationForNewLeadsCount(1).description,
    notificationForNewLeadsCount(4).title,
    notificationForNewBrokerageLead('Maya', { phone: '555', email: null }).title,
    notificationForLeadScoredHot('Sam'),
    notificationForLeadScored('Sam', 'WARM', 62).title,
    notificationForNewTour('Sam', '412 Elm'),
    notificationForNewTour('Sam', null),
    notificationForUpcomingTour(
      'Jane',
      new Date('2026-05-02T14:00:00'),
      '412 Elm',
      new Date('2026-05-01T08:00:00'),
    ).title,
    notificationForTourStatus('Sam', 'confirmed', null).title,
    notificationForTourStatus('Sam', 'completed', null).title,
    notificationForTourStatus('Sam', 'cancelled', null).title,
    notificationForTourStatus('Sam', 'no_show', null).title,
    notificationForToursNeedingFollowUp(1).title,
    notificationForFollowUpDue(
      'Maya',
      new Date('2026-05-01T09:00:00'),
      new Date('2026-05-03T09:00:00'),
    ).title,
    notificationForWaitlist(3).title,
    notificationForNewDeal('41 Sunset', null),
    notificationForDealStageMove('41 Sunset', 'Closing'),
    notificationForMemberJoined('a@x.com', 'realtor_member', 'join_code').title,
    notificationForMemberRemoved('a@x.com').title,
    notificationForReviewRequested('Alice', 'Smith', 'reason').title,
    notificationForDealWon('41 Sunset', 'Alice').title,
    notificationForBrokerageDealCreated('41 Sunset', 'Alice').title,
  ];

  it('has no exclamation marks anywhere', () => {
    for (const s of allSentences) {
      expect(s, `string with "!" — ${s}`).not.toMatch(/!/);
    }
  });

  it('uses no second-person addressing ("you have", "you will", "you might")', () => {
    for (const s of allSentences) {
      expect(s.toLowerCase()).not.toMatch(/\byou have\b/);
      expect(s.toLowerCase()).not.toMatch(/\byou will\b/);
      expect(s.toLowerCase()).not.toMatch(/\byou might\b/);
      expect(s.toLowerCase()).not.toMatch(/\byou should\b/);
    }
  });

  it('contains no emoji', () => {
    // Range covers most pictographs, transport, symbols, and the heat-flame.
    const emojiRange = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const s of allSentences) {
      expect(s).not.toMatch(emojiRange);
    }
  });

  it('keeps every notification under 12 words', () => {
    for (const s of allSentences) {
      const words = s.split(/\s+/).filter(Boolean).length;
      expect(words, `over 12 words — "${s}"`).toBeLessThanOrEqual(12);
    }
  });
});
