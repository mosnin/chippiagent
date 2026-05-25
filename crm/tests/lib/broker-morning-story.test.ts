import { describe, it, expect } from 'vitest';
import {
  composeBrokerMorningStory,
  type BrokerMorningSummary,
} from '@/lib/broker-morning-story';

const empty: BrokerMorningSummary = {
  topPerformer: null,
  behindPaceAgent: null,
  unassignedLeadsCount: 0,
  stuckDealsCount: 0,
  topStuckDeal: null,
};

const performer = (name: string, wonCount: number, id = 'user_perf') => ({
  topPerformer: { id, name, wonCount },
});

const behind = (name: string, daysQuiet: number, id = 'user_quiet') => ({
  behindPaceAgent: { id, name, daysQuiet },
});

const stuck = (title: string, daysStuck: number, count = 1) => ({
  stuckDealsCount: count,
  topStuckDeal: { id: 'deal_42', title, daysStuck },
});

describe('composeBrokerMorningStory', () => {
  // ── Names over counts (the depth move) ──────────────────────────────────

  it('names the top performer with first name and won count', () => {
    const out = composeBrokerMorningStory({
      ...empty,
      ...performer('Maya Chen', 4),
    });
    expect(out.text).toBe('Maya led the team last week — 4 deals closed.');
    expect(out.doorway).toEqual({ kind: 'realtor', id: 'user_perf' });
  });

  it('handles a single won deal (singular grammar)', () => {
    const out = composeBrokerMorningStory({
      ...empty,
      ...performer('David', 1),
    });
    expect(out.text).toBe('David led the team last week — 1 deal closed.');
  });

  it('skips the top performer branch when wonCount is zero', () => {
    // A "performer" with 0 wins isn't a performer — fall through to the
    // next loudest fact (or all-clear).
    const out = composeBrokerMorningStory({
      ...empty,
      ...performer('Maya', 0),
      unassignedLeadsCount: 2,
    });
    expect(out.text).toBe('2 new leads landed unassigned. Route them.');
    expect(out.doorway).toEqual({ kind: 'leads' });
  });

  // ── Behind-pace agent ───────────────────────────────────────────────────

  it('names the behind-pace agent with days quiet', () => {
    const out = composeBrokerMorningStory({
      ...empty,
      ...behind('David Lee', 5),
    });
    expect(out.text).toBe("David's behind pace — 0 calls in 5 days.");
    expect(out.doorway).toEqual({ kind: 'realtor', id: 'user_quiet' });
  });

  it('uses singular day grammar for 1 day quiet', () => {
    const out = composeBrokerMorningStory({
      ...empty,
      ...behind('Sam', 1),
    });
    expect(out.text).toBe("Sam's behind pace — 0 calls in 1 day.");
  });

  it('handles zero-day quiet with a "no outbound today" phrasing', () => {
    const out = composeBrokerMorningStory({
      ...empty,
      ...behind('Sam', 0),
    });
    expect(out.text).toBe("Sam's behind pace — no outbound today.");
  });

  // ── Unassigned leads + stuck deals + all-clear ──────────────────────────

  it('mentions unassigned leads and routes to /broker/leads', () => {
    const out = composeBrokerMorningStory({
      ...empty,
      unassignedLeadsCount: 3,
    });
    expect(out.text).toBe('3 new leads landed unassigned. Route them.');
    expect(out.doorway).toEqual({ kind: 'leads' });
  });

  it('uses singular for one unassigned lead', () => {
    const out = composeBrokerMorningStory({
      ...empty,
      unassignedLeadsCount: 1,
    });
    expect(out.text).toBe('1 new lead landed unassigned. Route them.');
  });

  it('falls through to team-wide stuck deals when nothing else is loud', () => {
    const out = composeBrokerMorningStory({
      ...empty,
      ...stuck('Chen', 12, 1),
    });
    expect(out.text).toBe('1 deal on the team has been stuck for 12 days.');
    expect(out.doorway).toBeNull();
  });

  it('mentions the team-wide stuck count when more than one is stuck', () => {
    const out = composeBrokerMorningStory({
      ...empty,
      ...stuck('Chen', 14, 3),
    });
    expect(out.text).toBe('3 deals stuck across the team — longest at 14 days.');
    expect(out.doorway).toBeNull();
  });

  it('lands on the quiet-team line when nothing is pressing', () => {
    const out = composeBrokerMorningStory(empty);
    expect(out.text).toBe("Quiet team week. Pipeline's healthy.");
    expect(out.doorway).toBeNull();
  });

  // ── Priority order ──────────────────────────────────────────────────────

  it('prefers the top performer over everything else', () => {
    const out = composeBrokerMorningStory({
      ...empty,
      ...performer('Maya', 3),
      ...behind('David', 6),
      unassignedLeadsCount: 5,
      ...stuck('Chen', 10, 2),
    });
    expect(out.text).toContain('Maya');
    expect(out.doorway).toEqual({ kind: 'realtor', id: 'user_perf' });
  });

  it('prefers behind-pace over unassigned leads when no top performer', () => {
    const out = composeBrokerMorningStory({
      ...empty,
      ...behind('David', 7),
      unassignedLeadsCount: 4,
    });
    expect(out.text).toContain("David's behind pace");
    expect(out.doorway).toEqual({ kind: 'realtor', id: 'user_quiet' });
  });

  it('prefers unassigned leads over stuck deals', () => {
    const out = composeBrokerMorningStory({
      ...empty,
      unassignedLeadsCount: 2,
      ...stuck('Chen', 9, 2),
    });
    expect(out.text).toContain('unassigned');
    expect(out.doorway).toEqual({ kind: 'leads' });
  });

  // ── Doorway integrity ───────────────────────────────────────────────────

  it('stuck-team and all-clear branches never carry a doorway', () => {
    expect(
      composeBrokerMorningStory({ ...empty, ...stuck('Chen', 5, 1) }).doorway,
    ).toBeNull();
    expect(composeBrokerMorningStory(empty).doorway).toBeNull();
  });

  // ── Agent sentence override ─────────────────────────────────────────────
  // Mirror the realtor side: when OpenAI returns a sentence, we use it for
  // text but always derive the doorway from the deterministic summary.

  it('uses the agent sentence on the top-performer branch but keeps the realtor doorway', () => {
    const out = composeBrokerMorningStory(
      { ...empty, ...performer('Maya', 4) },
      "Maya's on a tear — four wins this week.",
    );
    expect(out.text).toBe("Maya's on a tear — four wins this week.");
    expect(out.doorway).toEqual({ kind: 'realtor', id: 'user_perf' });
  });

  it('uses the agent sentence on the behind-pace branch but keeps the realtor doorway', () => {
    const out = composeBrokerMorningStory(
      { ...empty, ...behind('David', 5) },
      'David has gone radio silent — give him a nudge.',
    );
    expect(out.text).toBe('David has gone radio silent — give him a nudge.');
    expect(out.doorway).toEqual({ kind: 'realtor', id: 'user_quiet' });
  });

  it('uses the agent sentence on the unassigned-leads branch but keeps the leads doorway', () => {
    const out = composeBrokerMorningStory(
      { ...empty, unassignedLeadsCount: 3 },
      'Three fresh leads are sitting unassigned.',
    );
    expect(out.text).toBe('Three fresh leads are sitting unassigned.');
    expect(out.doorway).toEqual({ kind: 'leads' });
  });

  it('falls back to the ladder when the agent sentence is null', () => {
    const out = composeBrokerMorningStory(
      { ...empty, ...performer('Maya', 4) },
      null,
    );
    expect(out.text).toBe('Maya led the team last week — 4 deals closed.');
  });

  it('falls back to the ladder when the agent sentence is empty or whitespace', () => {
    expect(
      composeBrokerMorningStory({ ...empty, ...performer('Maya', 4) }, '').text,
    ).toBe('Maya led the team last week — 4 deals closed.');
    expect(
      composeBrokerMorningStory({ ...empty, ...performer('Maya', 4) }, '   ').text,
    ).toBe('Maya led the team last week — 4 deals closed.');
  });

  it('trims whitespace around an agent sentence', () => {
    const out = composeBrokerMorningStory(
      { ...empty, unassignedLeadsCount: 2 },
      '   Two leads need a home.   ',
    );
    expect(out.text).toBe('Two leads need a home.');
  });

  it('ignores the agent sentence on the all-clear branch (no named subject)', () => {
    const out = composeBrokerMorningStory(empty, 'Nothing to worry about today.');
    expect(out.text).toBe("Quiet team week. Pipeline's healthy.");
  });

  // ── First-name extraction edge cases ────────────────────────────────────

  it('uses the full single-name when there is no surname', () => {
    const out = composeBrokerMorningStory({
      ...empty,
      ...performer('Maya', 2),
    });
    expect(out.text).toBe('Maya led the team last week — 2 deals closed.');
  });

  it('extracts the first name from a multi-part name', () => {
    const out = composeBrokerMorningStory({
      ...empty,
      ...performer('Mary Anne Smith Jones', 3),
    });
    expect(out.text).toBe('Mary led the team last week — 3 deals closed.');
  });
});
