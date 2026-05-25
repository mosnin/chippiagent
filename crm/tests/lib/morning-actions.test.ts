import { describe, it, expect } from 'vitest';
import { buildMorningActions } from '@/components/chippi/morning-actions';
import type { MorningSummary } from '@/app/api/agent/morning/route';
import type { MorningDoorway } from '@/lib/morning-story';

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

describe('buildMorningActions', () => {
  it('returns nothing when the doorway is null (no inline panel for drafts/closing/all-clear)', () => {
    expect(buildMorningActions(null, empty, 'demo')).toEqual([]);
  });

  it('builds three deal actions: check-in (compose), log call (compose), open (navigate)', () => {
    const summary: MorningSummary = {
      ...empty,
      stuckDealsCount: 1,
      topStuckDeal: { id: 'd_chen', title: 'Chen', daysStuck: 14 },
    };
    const doorway: MorningDoorway = { kind: 'deal', id: 'd_chen' };
    const actions = buildMorningActions(doorway, summary, 'demo');

    expect(actions.map((a) => a.id)).toEqual(['deal-checkin', 'deal-log-call', 'deal-open']);
    expect(actions.map((a) => a.kind)).toEqual(['compose', 'compose', 'navigate']);

    // Compose actions carry intent + context for the inline draft endpoint —
    // no chat-prefill teleporter URL anymore.
    const checkin = actions[0]!;
    if (checkin.kind !== 'compose') throw new Error('expected compose');
    expect(checkin.intent).toBe('check-in');
    expect(checkin.context).toEqual({ kind: 'deal', id: 'd_chen', label: 'Chen' });

    const logCall = actions[1]!;
    if (logCall.kind !== 'compose') throw new Error('expected compose');
    expect(logCall.intent).toBe('log-call');
    expect(logCall.context.kind).toBe('deal');

    // Open the deal still goes to the workspace-scoped detail route.
    const open = actions[2]!;
    if (open.kind !== 'navigate') throw new Error('expected navigate');
    expect(open.href).toBe('/s/demo/deals/d_chen');
  });

  it('builds two person actions regardless of sub-kind: check-in (compose), open (navigate)', () => {
    const summary: MorningSummary = {
      ...empty,
      overdueFollowUpsCount: 1,
      topOverdueFollowUp: { id: 'p_sarah', name: 'Sarah', daysOverdue: 4 },
    };
    const doorway: MorningDoorway = { kind: 'person', id: 'p_sarah' };
    const actions = buildMorningActions(doorway, summary, 'demo');

    expect(actions.map((a) => a.id)).toEqual(['person-checkin', 'person-open']);
    expect(actions.map((a) => a.kind)).toEqual(['compose', 'navigate']);

    const checkin = actions[0]!;
    if (checkin.kind !== 'compose') throw new Error('expected compose');
    expect(checkin.intent).toBe('reach-out');
    expect(checkin.context).toEqual({ kind: 'person', id: 'p_sarah', label: 'Sarah' });

    const open = actions[1]!;
    if (open.kind !== 'navigate') throw new Error('expected navigate');
    expect(open.href).toBe('/s/demo/contacts/p_sarah');
  });

  it('uses welcome intent for new-arrival person doorways', () => {
    const summary: MorningSummary = {
      ...empty,
      newPeopleCount: 1,
      topNewPerson: { id: 'p_new', name: 'Maya' },
    };
    const doorway: MorningDoorway = { kind: 'person', id: 'p_new' };
    const actions = buildMorningActions(doorway, summary, 'demo');

    const checkin = actions[0]!;
    if (checkin.kind !== 'compose') throw new Error('expected compose');
    expect(checkin.intent).toBe('welcome');
    expect(checkin.context.label).toBe('Maya');
  });

  it('falls back to a generic label when the named person is missing from the summary', () => {
    // Doorway says "person" but summary has no named person — defensive path.
    const doorway: MorningDoorway = { kind: 'person', id: 'p_unknown' };
    const actions = buildMorningActions(doorway, empty, 'demo');
    const checkin = actions[0]!;
    if (checkin.kind !== 'compose') throw new Error('expected compose');
    expect(checkin.context.label).toBe('them');
  });

  // ── Tier-agnostic doorway resolution ────────────────────────────────────
  // The "Next" pill on the home cycles the doorway through the named-subject
  // ladder. The actions panel must label whichever subject the doorway lands
  // on — not assume the highest-priority tier wins. Otherwise cycling to
  // "Maya (hot)" while Sarah (overdue) is also present would label the panel
  // with Sarah's name.

  it('labels the hot person when the doorway lands on the hot id, even if overdue is present', () => {
    const summary: MorningSummary = {
      ...empty,
      overdueFollowUpsCount: 1,
      topOverdueFollowUp: { id: 'p_sarah', name: 'Sarah', daysOverdue: 4 },
      hotPeopleCount: 1,
      topHotPerson: { id: 'p_maya', name: 'Maya' },
    };
    const doorway: MorningDoorway = { kind: 'person', id: 'p_maya' };
    const actions = buildMorningActions(doorway, summary, 'demo');
    const checkin = actions[0]!;
    if (checkin.kind !== 'compose') throw new Error('expected compose');
    expect(checkin.context.label).toBe('Maya');
    expect(checkin.intent).toBe('reach-out');
    const open = actions[1]!;
    if (open.kind !== 'navigate') throw new Error('expected navigate');
    expect(open.href).toBe('/s/demo/contacts/p_maya');
  });

  it('labels the new person when the doorway lands on the new id, even with hot present', () => {
    const summary: MorningSummary = {
      ...empty,
      hotPeopleCount: 1,
      topHotPerson: { id: 'p_maya', name: 'Maya' },
      newPeopleCount: 1,
      topNewPerson: { id: 'p_david', name: 'David' },
    };
    const doorway: MorningDoorway = { kind: 'person', id: 'p_david' };
    const actions = buildMorningActions(doorway, summary, 'demo');
    const checkin = actions[0]!;
    if (checkin.kind !== 'compose') throw new Error('expected compose');
    expect(checkin.context.label).toBe('David');
    // 'welcome' only when the doorway specifically lands on the new arrival.
    expect(checkin.intent).toBe('welcome');
  });

  it('labels the overdue person when the doorway lands on the overdue id with all tiers present', () => {
    const summary: MorningSummary = {
      ...empty,
      overdueFollowUpsCount: 1,
      topOverdueFollowUp: { id: 'p_sarah', name: 'Sarah', daysOverdue: 4 },
      hotPeopleCount: 1,
      topHotPerson: { id: 'p_maya', name: 'Maya' },
      newPeopleCount: 1,
      topNewPerson: { id: 'p_david', name: 'David' },
    };
    const doorway: MorningDoorway = { kind: 'person', id: 'p_sarah' };
    const actions = buildMorningActions(doorway, summary, 'demo');
    const checkin = actions[0]!;
    if (checkin.kind !== 'compose') throw new Error('expected compose');
    expect(checkin.context.label).toBe('Sarah');
    expect(checkin.intent).toBe('reach-out');
  });
});
