import { describe, it, expect } from 'vitest';
import {
  buildPeopleDetailActions,
  type PersonStateForActions,
} from '@/lib/people-detail-actions';

const base: PersonStateForActions = {
  scoreLabel: null,
  daysQuiet: null,
  followUpAt: null,
  isNew: false,
  archivedAt: null,
};

const isoDaysFromNow = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString();

describe('buildPeopleDetailActions', () => {
  it('archived people get no actions', () => {
    const actions = buildPeopleDetailActions({
      ...base,
      scoreLabel: 'hot',
      daysQuiet: 30,
      archivedAt: new Date().toISOString(),
    });
    expect(actions).toEqual([]);
  });

  it('hot + quiet 9 days → check-in + schedule a tour', () => {
    const actions = buildPeopleDetailActions({
      ...base,
      scoreLabel: 'hot',
      daysQuiet: 9,
    });
    expect(actions.map((a) => a.id)).toEqual(['check-in', 'schedule-tour']);
    expect(actions[0].label).toBe('Send a check-in');
    expect(actions[1].intent).toBe('schedule-tour');
  });

  it('cold + quiet 9 days → check-in + log a call', () => {
    const actions = buildPeopleDetailActions({
      ...base,
      scoreLabel: 'cold',
      daysQuiet: 9,
    });
    expect(actions.map((a) => a.id)).toEqual(['check-in', 'log-call']);
  });

  it('cold but only quiet 3 days → reach-out + log-call (not the cold-quiet rule)', () => {
    const actions = buildPeopleDetailActions({
      ...base,
      scoreLabel: 'cold',
      daysQuiet: 3,
    });
    expect(actions.map((a) => a.id)).toEqual(['reach-out', 'log-call']);
  });

  it('new person nobody has touched → welcome + log a call', () => {
    const actions = buildPeopleDetailActions({
      ...base,
      isNew: true,
      daysQuiet: null,
    });
    expect(actions.map((a) => a.id)).toEqual(['welcome', 'log-call']);
    expect(actions[0].intent).toBe('welcome');
  });

  it('overdue follow-up wins over score → check-in + clear follow-up', () => {
    const actions = buildPeopleDetailActions({
      ...base,
      scoreLabel: 'hot',
      daysQuiet: 4,
      followUpAt: isoDaysFromNow(-2),
    });
    expect(actions.map((a) => a.id)).toEqual(['check-in', 'clear-followup']);
  });

  it('future follow-up is not overdue → falls through to score-based rule', () => {
    const actions = buildPeopleDetailActions({
      ...base,
      scoreLabel: 'hot',
      daysQuiet: 4,
      followUpAt: isoDaysFromNow(3),
    });
    expect(actions.map((a) => a.id)).toEqual(['check-in', 'schedule-tour']);
  });

  it('uncontacted, not new → single reach-out pill', () => {
    const actions = buildPeopleDetailActions({ ...base });
    expect(actions.map((a) => a.id)).toEqual(['reach-out']);
  });

  it('warm + daysQuiet → reach-out + log-call', () => {
    const actions = buildPeopleDetailActions({
      ...base,
      scoreLabel: 'warm',
      daysQuiet: 12,
    });
    expect(actions.map((a) => a.id)).toEqual(['reach-out', 'log-call']);
  });

  it('caps at three actions for any state (sanity)', () => {
    for (const scoreLabel of ['hot', 'warm', 'cold', null] as const) {
      for (const daysQuiet of [null, 0, 3, 9, 30]) {
        for (const isNew of [false, true]) {
          for (const followUpAt of [null, isoDaysFromNow(-3), isoDaysFromNow(3)]) {
            const actions = buildPeopleDetailActions({
              scoreLabel,
              daysQuiet,
              isNew,
              followUpAt,
              archivedAt: null,
            });
            expect(actions.length).toBeLessThanOrEqual(3);
          }
        }
      }
    }
  });
});
