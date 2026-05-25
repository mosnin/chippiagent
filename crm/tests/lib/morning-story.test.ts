import { describe, it, expect } from 'vitest';
import { composeMorningStory, countMorningCandidates } from '@/lib/morning-story';
import type { MorningSummary } from '@/app/api/agent/morning/route';

const empty: MorningSummary = {
  newPeopleCount: 0,
  hotPeopleCount: 0,
  overdueFollowUpsCount: 0,
  stuckDealsCount: 0,
  closingThisWeekCount: 0,
  draftsCount: 0,
  questionsCount: 0,
  topStuckDeal: null,
  topOverdueFollowUp: null,
  topNewPerson: null,
  topHotPerson: null,
};

const stuck = (title: string, daysStuck: number, count = 1) => ({
  stuckDealsCount: count,
  topStuckDeal: { id: 'deal_42', title, daysStuck },
});

const overdue = (name: string, daysOverdue: number, count = 1) => ({
  overdueFollowUpsCount: count,
  topOverdueFollowUp: { id: 'contact_7', name, daysOverdue },
});

const newPerson = (name: string, count = 1) => ({
  newPeopleCount: count,
  topNewPerson: { id: 'contact_new', name },
});

const hotPerson = (name: string, count = 1) => ({
  hotPeopleCount: count,
  topHotPerson: { id: 'contact_hot', name },
});

describe('composeMorningStory', () => {
  // ── Names over counts (the depth move) ──────────────────────────────────

  it('names the longest-stuck deal, not just a count', () => {
    const out = composeMorningStory({
      ...empty,
      ...stuck('Chen', 14),
    });
    expect(out.text).toBe("The Chen deal hasn't moved in 14 days.");
    expect(out.doorway).toEqual({ kind: 'deal', id: 'deal_42' });
  });

  it('names the most-overdue follow-up by person', () => {
    const out = composeMorningStory({
      ...empty,
      ...overdue('Sarah', 4),
    });
    expect(out.text).toBe("Sarah's follow-up is 4 days overdue.");
    expect(out.doorway).toEqual({ kind: 'person', id: 'contact_7' });
  });

  it('names the most-recent new arrival', () => {
    const out = composeMorningStory({
      ...empty,
      ...newPerson('David'),
    });
    expect(out.text).toBe('David just applied. Welcome them.');
    expect(out.doorway).toEqual({ kind: 'person', id: 'contact_new' });
  });

  it('names the hottest unworked person without ambiguity', () => {
    const out = composeMorningStory({
      ...empty,
      ...hotPerson('Maya'),
    });
    expect(out.text).toBe("Maya's score is hot. Reach out.");
    expect(out.doorway).toEqual({ kind: 'person', id: 'contact_hot' });
  });

  // ── Singular vs plural day handling ─────────────────────────────────────

  it('handles 1 day vs N days for stuck deals', () => {
    expect(
      composeMorningStory({ ...empty, ...stuck('Lee', 1) }).text,
    ).toBe("The Lee deal hasn't moved in 1 day.");
    expect(
      composeMorningStory({ ...empty, ...stuck('Lee', 0) }).text,
    ).toBe('The Lee deal is stuck.');
  });

  it('handles "due today" / "1 day overdue" / "N days overdue"', () => {
    expect(
      composeMorningStory({ ...empty, ...overdue('Sam', 0) }).text,
    ).toBe("Sam's follow-up is due today.");
    expect(
      composeMorningStory({ ...empty, ...overdue('Sam', 1) }).text,
    ).toBe("Sam's follow-up is 1 day overdue.");
    expect(
      composeMorningStory({ ...empty, ...overdue('Sam', 9) }).text,
    ).toBe("Sam's follow-up is 9 days overdue.");
  });

  // ── Queue tail: the sentence stays clean, no parenthetical ──────────────
  // The realtor sees the rest of the queue on click-through. A trailing
  // "(N more stuck.)" reads like programmer copy, not a thoughtful friend.

  it('does not append a queue-tail parenthetical for stuck deals', () => {
    const out = composeMorningStory({ ...empty, ...stuck('Chen', 14, 3) });
    expect(out.text).toBe("The Chen deal hasn't moved in 14 days.");
    expect(out.text).not.toMatch(/\(/);
    expect(out.text).not.toMatch(/more/);
  });

  it('does not append a queue-tail parenthetical for overdue follow-ups', () => {
    const out = composeMorningStory({ ...empty, ...overdue('Sarah', 4, 5) });
    expect(out.text).toBe("Sarah's follow-up is 4 days overdue.");
    expect(out.text).not.toMatch(/\(/);
  });

  it('does not append a queue-tail parenthetical for new people', () => {
    const out = composeMorningStory({ ...empty, ...newPerson('David', 2) });
    expect(out.text).toBe('David just applied. Welcome them.');
    expect(out.text).not.toMatch(/\(/);
  });

  it('does not append a queue-tail parenthetical for hot people', () => {
    const out = composeMorningStory({ ...empty, ...hotPerson('Maya', 3) });
    expect(out.text).toBe("Maya's score is hot. Reach out.");
    expect(out.text).not.toMatch(/\(/);
  });

  // ── Long / messy deal titles: fall back to a generic subject ────────────
  // Titles like "Smith — buyer, $700k Sunset Strip" wreck the sentence
  // cadence. Drop to "A deal hasn't moved in 14 days." — doorway is intact.

  it('falls back to a generic subject when the title contains an em-dash', () => {
    const out = composeMorningStory({
      ...empty,
      ...stuck('Smith — buyer, $700k Sunset Strip', 14),
    });
    expect(out.text).toBe("A deal hasn't moved in 14 days.");
    expect(out.doorway).toEqual({ kind: 'deal', id: 'deal_42' });
  });

  it('falls back to a generic subject when the title contains a comma', () => {
    const out = composeMorningStory({
      ...empty,
      ...stuck('Park, downtown', 7),
    });
    expect(out.text).toBe("A deal hasn't moved in 7 days.");
  });

  it('falls back to a generic subject when the title contains parentheses', () => {
    const out = composeMorningStory({
      ...empty,
      ...stuck('Nguyen (referral)', 3),
    });
    expect(out.text).toBe("A deal hasn't moved in 3 days.");
  });

  it('falls back to a generic subject when the title is overly long', () => {
    const out = composeMorningStory({
      ...empty,
      ...stuck('A really very extremely long deal name here', 5),
    });
    expect(out.text).toBe("A deal hasn't moved in 5 days.");
  });

  it('uses the generic subject for a 0-day stuck deal with a messy title', () => {
    const out = composeMorningStory({
      ...empty,
      ...stuck('Smith — buyer, $700k', 0),
    });
    expect(out.text).toBe('A deal is stuck.');
  });

  // ── Priority order ──────────────────────────────────────────────────────

  it('prefers stuck deals over everything else', () => {
    const out = composeMorningStory({
      ...empty,
      ...stuck('Chen', 14),
      ...overdue('Sarah', 4),
      ...newPerson('David'),
      ...hotPerson('Maya'),
      draftsCount: 5,
    });
    expect(out.text).toContain('Chen');
    expect(out.doorway?.kind).toBe('deal');
  });

  it('prefers overdue follow-ups when no deals are stuck', () => {
    const out = composeMorningStory({
      ...empty,
      ...overdue('Sarah', 4),
      ...newPerson('David'),
    });
    expect(out.text).toContain("Sarah's follow-up");
    expect(out.doorway?.kind).toBe('person');
  });

  // Hot beats new: hot is measured intent that's actively rotting; new is
  // just an arrival with no signal yet. The realtor's first move should be
  // on the lead whose interest is cooling, not the freshest face.
  it('prefers a hot person over a new person', () => {
    const out = composeMorningStory({
      ...empty,
      ...hotPerson('Maya'),
      ...newPerson('David'),
    });
    expect(out.text).toBe("Maya's score is hot. Reach out.");
    expect(out.doorway).toEqual({ kind: 'person', id: 'contact_hot' });
  });

  it('falls through to a new person when no hot person is present', () => {
    const out = composeMorningStory({
      ...empty,
      ...newPerson('David'),
    });
    expect(out.text).toBe('David just applied. Welcome them.');
    expect(out.doorway).toEqual({ kind: 'person', id: 'contact_new' });
  });

  // Tie-break the new combined ordering: stuck > overdue > hot > new.
  // When all four are present, stuck still wins — but the ordering below it
  // matters for the more common "no stuck, no overdue" morning.
  it('walks the full ladder cleanly: stuck > overdue > hot > new', () => {
    const allFour: MorningSummary = {
      ...empty,
      ...stuck('Chen', 14),
      ...overdue('Sarah', 4),
      ...hotPerson('Maya'),
      ...newPerson('David'),
    };
    expect(composeMorningStory(allFour).doorway).toEqual({ kind: 'deal', id: 'deal_42' });

    const noStuck: MorningSummary = { ...allFour, stuckDealsCount: 0, topStuckDeal: null };
    expect(composeMorningStory(noStuck).doorway).toEqual({ kind: 'person', id: 'contact_7' });

    const noStuckNoOverdue: MorningSummary = {
      ...noStuck,
      overdueFollowUpsCount: 0,
      topOverdueFollowUp: null,
    };
    expect(composeMorningStory(noStuckNoOverdue).doorway).toEqual({
      kind: 'person',
      id: 'contact_hot',
    });

    const onlyNew: MorningSummary = {
      ...noStuckNoOverdue,
      hotPeopleCount: 0,
      topHotPerson: null,
    };
    expect(composeMorningStory(onlyNew).doorway).toEqual({ kind: 'person', id: 'contact_new' });
  });

  // Null-safety: a null topHotPerson while hotPeopleCount > 0 must not crash
  // or wrongly skip the new-person branch. The named subject is the gate.
  it('skips the hot branch cleanly when topHotPerson is null even with a count', () => {
    const out = composeMorningStory({
      ...empty,
      hotPeopleCount: 3,
      topHotPerson: null,
      ...newPerson('David'),
    });
    expect(out.text).toBe('David just applied. Welcome them.');
    expect(out.doorway).toEqual({ kind: 'person', id: 'contact_new' });
  });

  // ── Drafts/questions/closing/all-clear branches ─────────────────────────

  it('falls through to drafts/questions when no people-side urgencies', () => {
    expect(
      composeMorningStory({ ...empty, draftsCount: 3, questionsCount: 1 }).text,
    ).toBe('3 drafts · 1 question waiting for you.');
  });

  it('shows closing-this-week when nothing else is loud', () => {
    expect(
      composeMorningStory({ ...empty, closingThisWeekCount: 2 }).text,
    ).toBe('2 deals closing this week. Keep them on track.');
  });

  it('lands on "all clear" when nothing is pressing', () => {
    expect(composeMorningStory(empty).text).toBe(
      "Nothing pressing. I'm watching the pipeline.",
    );
  });

  // ── Doorway integrity ───────────────────────────────────────────────────

  it('drafts/closing/all-clear branches never carry a doorway', () => {
    expect(
      composeMorningStory({ ...empty, draftsCount: 3 }).doorway,
    ).toBeNull();
    expect(
      composeMorningStory({ ...empty, closingThisWeekCount: 1 }).doorway,
    ).toBeNull();
    expect(composeMorningStory(empty).doorway).toBeNull();
  });

  // ── Agent sentence override ─────────────────────────────────────────────
  // The route's OpenAI compose, when it succeeds, hands a sentence back here.
  // We use the model's text but keep the doorway deterministic — we don't
  // trust the model with navigation.

  it('uses the agent sentence when provided, but keeps the deal doorway', () => {
    const out = composeMorningStory(
      { ...empty, ...stuck('Chen', 14) },
      "Chen's been parked for two weeks — nudge it.",
    );
    expect(out.text).toBe("Chen's been parked for two weeks — nudge it.");
    expect(out.doorway).toEqual({ kind: 'deal', id: 'deal_42' });
  });

  it('uses the agent sentence when provided, but keeps the person doorway (overdue)', () => {
    const out = composeMorningStory(
      { ...empty, ...overdue('Sarah', 4) },
      "Sarah's been waiting four days. Call her.",
    );
    expect(out.text).toBe("Sarah's been waiting four days. Call her.");
    expect(out.doorway).toEqual({ kind: 'person', id: 'contact_7' });
  });

  it('uses the agent sentence for new-person branch with the right doorway', () => {
    const out = composeMorningStory(
      { ...empty, ...newPerson('David') },
      'David just walked in — say hi.',
    );
    expect(out.text).toBe('David just walked in — say hi.');
    expect(out.doorway).toEqual({ kind: 'person', id: 'contact_new' });
  });

  it('uses the agent sentence for hot-person branch with the right doorway', () => {
    const out = composeMorningStory(
      { ...empty, ...hotPerson('Maya') },
      'Maya is heating up. Move now.',
    );
    expect(out.text).toBe('Maya is heating up. Move now.');
    expect(out.doorway).toEqual({ kind: 'person', id: 'contact_hot' });
  });

  it('falls back to the ladder when the agent sentence is null', () => {
    const out = composeMorningStory(
      { ...empty, ...stuck('Chen', 14) },
      null,
    );
    expect(out.text).toBe("The Chen deal hasn't moved in 14 days.");
  });

  it('falls back to the ladder when the agent sentence is undefined', () => {
    const out = composeMorningStory(
      { ...empty, ...stuck('Chen', 14) },
      undefined,
    );
    expect(out.text).toBe("The Chen deal hasn't moved in 14 days.");
  });

  it('falls back to the ladder when the agent sentence is an empty string', () => {
    const out = composeMorningStory(
      { ...empty, ...stuck('Chen', 14) },
      '',
    );
    expect(out.text).toBe("The Chen deal hasn't moved in 14 days.");
  });

  it('falls back to the ladder when the agent sentence is whitespace only', () => {
    const out = composeMorningStory(
      { ...empty, ...stuck('Chen', 14) },
      '   \n\t  ',
    );
    expect(out.text).toBe("The Chen deal hasn't moved in 14 days.");
  });

  it('trims whitespace around an agent sentence', () => {
    const out = composeMorningStory(
      { ...empty, ...overdue('Sarah', 4) },
      '   Sarah is overdue. Reach out today.   ',
    );
    expect(out.text).toBe('Sarah is overdue. Reach out today.');
  });

  it('ignores the agent sentence on branches with no named subject (drafts)', () => {
    // The agent should not be called when there's no named subject — but if a
    // sentence somehow leaks through, the count-only branches stay canonical.
    const out = composeMorningStory(
      { ...empty, draftsCount: 3 },
      'You have a few things waiting.',
    );
    expect(out.text).toBe('3 drafts waiting for you.');
  });

  it('ignores the agent sentence on the all-clear branch', () => {
    const out = composeMorningStory(empty, 'Nothing to worry about today.');
    expect(out.text).toBe("Nothing pressing. I'm watching the pipeline.");
  });

  // ── Skip / cycle: the "Next" pill on the home ────────────────────────────
  // With 47 hot leads the realtor sees the same face every morning until they
  // touch it — the single decision becomes nagging. The home cycles through
  // named subjects in priority order. skip=0 is unchanged default behavior;
  // skip=1 picks the second candidate; skip>=N falls through to the count
  // tail. Default callers (no opts) get exactly today's behavior.

  it('skip=0 (default unchanged) picks the top of the ladder', () => {
    const all: MorningSummary = {
      ...empty,
      ...stuck('Chen', 14),
      ...overdue('Sarah', 4),
      ...hotPerson('Maya'),
      ...newPerson('David'),
    };
    const a = composeMorningStory(all);
    const b = composeMorningStory(all, null, { skip: 0 });
    expect(a).toEqual(b);
    expect(a.doorway).toEqual({ kind: 'deal', id: 'deal_42' });
  });

  it('skip=1 picks the second candidate (overdue, when stuck is at 0)', () => {
    const all: MorningSummary = {
      ...empty,
      ...stuck('Chen', 14),
      ...overdue('Sarah', 4),
      ...hotPerson('Maya'),
      ...newPerson('David'),
    };
    const out = composeMorningStory(all, null, { skip: 1 });
    expect(out.text).toBe("Sarah's follow-up is 4 days overdue.");
    expect(out.doorway).toEqual({ kind: 'person', id: 'contact_7' });
  });

  it('skip=2 picks the hot person when stuck + overdue + hot + new are all present', () => {
    const all: MorningSummary = {
      ...empty,
      ...stuck('Chen', 14),
      ...overdue('Sarah', 4),
      ...hotPerson('Maya'),
      ...newPerson('David'),
    };
    const out = composeMorningStory(all, null, { skip: 2 });
    expect(out.text).toBe("Maya's score is hot. Reach out.");
    expect(out.doorway).toEqual({ kind: 'person', id: 'contact_hot' });
  });

  it('skip=3 picks the new person when all four candidates are present', () => {
    const all: MorningSummary = {
      ...empty,
      ...stuck('Chen', 14),
      ...overdue('Sarah', 4),
      ...hotPerson('Maya'),
      ...newPerson('David'),
    };
    const out = composeMorningStory(all, null, { skip: 3 });
    expect(out.text).toBe('David just applied. Welcome them.');
    expect(out.doorway).toEqual({ kind: 'person', id: 'contact_new' });
  });

  it('skip indexes only the present candidates (no gaps)', () => {
    // Only stuck + new present: skip=1 should land on new, not silently fall
    // through past empty hot/overdue tiers.
    const summary: MorningSummary = {
      ...empty,
      ...stuck('Chen', 14),
      ...newPerson('David'),
    };
    const out = composeMorningStory(summary, null, { skip: 1 });
    expect(out.text).toBe('David just applied. Welcome them.');
    expect(out.doorway).toEqual({ kind: 'person', id: 'contact_new' });
  });

  it('skip >= candidates.length falls through to drafts/questions tail', () => {
    const summary: MorningSummary = {
      ...empty,
      ...stuck('Chen', 14),
      ...overdue('Sarah', 4),
      draftsCount: 3,
    };
    // 2 named candidates: stuck, overdue. skip=2 falls through.
    const out = composeMorningStory(summary, null, { skip: 2 });
    expect(out.text).toBe('3 drafts waiting for you.');
    expect(out.doorway).toBeNull();
  });

  it('skip >= candidates.length falls through to closing-this-week when no drafts', () => {
    const summary: MorningSummary = {
      ...empty,
      ...hotPerson('Maya'),
      closingThisWeekCount: 2,
    };
    const out = composeMorningStory(summary, null, { skip: 5 });
    expect(out.text).toBe('2 deals closing this week. Keep them on track.');
    expect(out.doorway).toBeNull();
  });

  it('skip >= candidates.length falls through to all-clear when nothing else', () => {
    const summary: MorningSummary = {
      ...empty,
      ...hotPerson('Maya'),
    };
    const out = composeMorningStory(summary, null, { skip: 1 });
    expect(out.text).toBe("Nothing pressing. I'm watching the pipeline.");
    expect(out.doorway).toBeNull();
  });

  it('skip with no candidates at all goes straight to the count tail', () => {
    const out = composeMorningStory({ ...empty, draftsCount: 1 }, null, { skip: 0 });
    expect(out.text).toBe('1 draft waiting for you.');
  });

  it('agent sentence override applies only at skip=0; cycling reverts to deterministic copy', () => {
    // The agent composes a sentence for the *top* subject. When the realtor
    // taps Next, the subject changes — the model's line for the original
    // subject would be wrong. Fall back to the deterministic copy.
    const summary: MorningSummary = {
      ...empty,
      ...stuck('Chen', 14),
      ...overdue('Sarah', 4),
    };
    const top = composeMorningStory(summary, "Chen's been parked — nudge it.", { skip: 0 });
    expect(top.text).toBe("Chen's been parked — nudge it.");

    const next = composeMorningStory(summary, "Chen's been parked — nudge it.", { skip: 1 });
    expect(next.text).toBe("Sarah's follow-up is 4 days overdue.");
    expect(next.doorway).toEqual({ kind: 'person', id: 'contact_7' });
  });

  it('negative or fractional skip is treated as 0', () => {
    const summary: MorningSummary = { ...empty, ...stuck('Chen', 14) };
    expect(composeMorningStory(summary, null, { skip: -3 }).text).toBe(
      "The Chen deal hasn't moved in 14 days.",
    );
    expect(composeMorningStory(summary, null, { skip: 0.7 }).text).toBe(
      "The Chen deal hasn't moved in 14 days.",
    );
  });
});

describe('countMorningCandidates', () => {
  it('returns 0 when no named subjects are present', () => {
    expect(countMorningCandidates(empty)).toBe(0);
    expect(countMorningCandidates({ ...empty, draftsCount: 5 })).toBe(0);
    expect(countMorningCandidates({ ...empty, closingThisWeekCount: 2 })).toBe(0);
  });

  it('counts each named subject (stuck/overdue/hot/new) independently', () => {
    expect(countMorningCandidates({ ...empty, ...stuck('Chen', 14) })).toBe(1);
    expect(countMorningCandidates({
      ...empty,
      ...stuck('Chen', 14),
      ...overdue('Sarah', 4),
    })).toBe(2);
    expect(countMorningCandidates({
      ...empty,
      ...stuck('Chen', 14),
      ...overdue('Sarah', 4),
      ...hotPerson('Maya'),
    })).toBe(3);
    expect(countMorningCandidates({
      ...empty,
      ...stuck('Chen', 14),
      ...overdue('Sarah', 4),
      ...hotPerson('Maya'),
      ...newPerson('David'),
    })).toBe(4);
  });

  it('caps at 4 — that is the entire ladder', () => {
    // The route only carries one of each (topStuckDeal, topOverdue,
    // topHot, topNew). Four is the ceiling. v1 cycles between those.
    const all: MorningSummary = {
      ...empty,
      ...stuck('Chen', 14),
      ...overdue('Sarah', 4),
      ...hotPerson('Maya'),
      ...newPerson('David'),
    };
    expect(countMorningCandidates(all)).toBe(4);
  });
});
