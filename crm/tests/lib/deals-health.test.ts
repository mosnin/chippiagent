import { describe, it, expect } from 'vitest';
import { dealHealth, inferNextAction, classifyForStrips } from '@/lib/deals/health';

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

const baseHealth = { nextAction: null, nextActionDueAt: null } as const;

describe('dealHealth', () => {
  it('is on-track for a fresh active deal', () => {
    expect(dealHealth({ status: 'active', updatedAt: daysAgo(2), closeDate: null, followUpAt: null, ...baseHealth }).state).toBe('on-track');
  });

  it('flags 15+ days in stage as at-risk', () => {
    expect(dealHealth({ status: 'active', updatedAt: daysAgo(20), closeDate: null, followUpAt: null, ...baseHealth }).state).toBe('at-risk');
  });

  it('flags 30+ days in stage as stuck', () => {
    expect(dealHealth({ status: 'active', updatedAt: daysAgo(45), closeDate: null, followUpAt: null, ...baseHealth }).state).toBe('stuck');
  });

  it('flags overdue follow-up as at-risk', () => {
    expect(dealHealth({ status: 'active', updatedAt: daysAgo(1), closeDate: null, followUpAt: daysAgo(3), ...baseHealth }).state).toBe('at-risk');
  });

  it('flags expected close passed 3+ days as stuck', () => {
    expect(dealHealth({ status: 'active', updatedAt: daysAgo(1), closeDate: daysAgo(5), followUpAt: null, ...baseHealth }).state).toBe('stuck');
  });

  it('flags closing within 3 days as at-risk', () => {
    expect(dealHealth({ status: 'active', updatedAt: daysAgo(1), closeDate: daysFromNow(2), followUpAt: null, ...baseHealth }).state).toBe('at-risk');
  });

  it('flags overdue nextAction as at-risk', () => {
    expect(dealHealth({
      status: 'active',
      updatedAt: daysAgo(1),
      closeDate: null,
      followUpAt: null,
      nextAction: 'Email lender',
      nextActionDueAt: daysAgo(2),
    }).state).toBe('at-risk');
  });

  it('never flags a won deal', () => {
    expect(dealHealth({
      status: 'won',
      updatedAt: daysAgo(60),
      closeDate: daysAgo(30),
      followUpAt: daysAgo(30),
      nextAction: 'Whatever',
      nextActionDueAt: daysAgo(10),
    }).state).toBe('on-track');
  });
});

describe('inferNextAction', () => {
  const baseAction = { nextAction: null, nextActionDueAt: null } as const;

  it('returns null for won/lost deals', () => {
    expect(inferNextAction({ status: 'won', followUpAt: daysFromNow(1), closeDate: null, ...baseAction })).toBeNull();
  });

  it('prefers an explicit nextAction over follow-up/close-date inference', () => {
    const a = inferNextAction({
      status: 'active',
      followUpAt: daysFromNow(2),
      closeDate: daysFromNow(5),
      nextAction: 'Confirm inspection with John',
      nextActionDueAt: daysFromNow(1),
    });
    expect(a?.label).toBe('Confirm inspection with John');
  });

  it('leads with overdue follow-up', () => {
    const a = inferNextAction({ status: 'active', followUpAt: daysAgo(2), closeDate: null, ...baseAction });
    expect(a?.label).toMatch(/overdue/i);
  });

  it('announces today follow-up', () => {
    const a = inferNextAction({ status: 'active', followUpAt: daysFromNow(0), closeDate: null, ...baseAction });
    expect(a?.label).toMatch(/today/i);
  });

  it('falls back to closing countdown when no follow-up', () => {
    const a = inferNextAction({ status: 'active', followUpAt: null, closeDate: daysFromNow(5), ...baseAction });
    expect(a?.label).toMatch(/closing in 5 days/i);
  });

  it('returns null for a quiet deal with no hints', () => {
    expect(inferNextAction({ status: 'active', followUpAt: null, closeDate: null, ...baseAction })).toBeNull();
  });
});

describe('classifyForStrips', () => {
  const base = { status: 'active' as const, updatedAt: daysAgo(1), closeDate: null, followUpAt: null, nextAction: null, nextActionDueAt: null };

  it('puts closing-this-week deals in the first bucket', () => {
    const deals = [
      { ...base, id: 'a', closeDate: daysFromNow(3) },
      { ...base, id: 'b', closeDate: daysFromNow(20) },
    ];
    const { closingThisWeek } = classifyForStrips(deals);
    expect(closingThisWeek.map((d) => d.id)).toEqual(['a']);
  });

  it('puts at-risk + stuck deals in the second bucket', () => {
    const deals = [
      { ...base, id: 'fresh' },
      { ...base, id: 'stuck', updatedAt: daysAgo(40) },
      { ...base, id: 'atrisk', updatedAt: daysAgo(20) },
    ];
    const { atRisk } = classifyForStrips(deals);
    expect(atRisk.map((d) => d.id).sort()).toEqual(['atrisk', 'stuck']);
  });

  it('puts overdue follow-ups in the third bucket', () => {
    const deals = [
      { ...base, id: 'overdue', followUpAt: daysAgo(2) },
      { ...base, id: 'fine', followUpAt: daysFromNow(2) },
    ];
    const { waitingOnMe } = classifyForStrips(deals);
    expect(waitingOnMe.map((d) => d.id)).toEqual(['overdue']);
  });

  it('ignores non-active deals everywhere', () => {
    const deals = [
      { ...base, id: 'won', status: 'won' as const, closeDate: daysFromNow(2), followUpAt: daysAgo(5), updatedAt: daysAgo(40) },
    ];
    const { closingThisWeek, atRisk, waitingOnMe } = classifyForStrips(deals);
    expect(closingThisWeek).toHaveLength(0);
    expect(atRisk).toHaveLength(0);
    expect(waitingOnMe).toHaveLength(0);
  });
});
