import { describe, it, expect } from 'vitest';
import {
  BUYER_RESIDENTIAL_TEMPLATE,
  materializeTemplate,
  summarizeChecklist,
} from '@/lib/deals/checklist';

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

describe('materializeTemplate', () => {
  it('anchors due dates to closeDate when provided', () => {
    const close = daysFromNow(40);
    const items = materializeTemplate(BUYER_RESIDENTIAL_TEMPLATE, close);
    const closing = items.find((i) => i.kind === 'closing');
    expect(closing?.dueAt).toBe(close.toISOString());
  });

  it('falls back to absolute offsets when closeDate is null', () => {
    const items = materializeTemplate(BUYER_RESIDENTIAL_TEMPLATE, null);
    const earnest = items.find((i) => i.kind === 'earnest_money');
    expect(earnest?.dueAt).toBe(daysFromNow(3).toISOString());
  });

  it('does not seed items with dueAt in the past', () => {
    // closeDate is 5 days away, earnest money offset is -35. That would
    // land 30 days in the past — expect it clamped to today instead.
    const close = daysFromNow(5);
    const items = materializeTemplate(BUYER_RESIDENTIAL_TEMPLATE, close);
    const earnest = items.find((i) => i.kind === 'earnest_money');
    expect(new Date(earnest!.dueAt!).getTime()).toBeGreaterThanOrEqual(daysFromNow(0).getTime());
  });

  it('preserves template order via position field', () => {
    const items = materializeTemplate(BUYER_RESIDENTIAL_TEMPLATE, daysFromNow(30));
    const positions = items.map((i) => i.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

describe('summarizeChecklist', () => {
  const now = new Date().toISOString();

  it('returns null when there are no items', () => {
    expect(summarizeChecklist([])).toBeNull();
  });

  it('counts completed vs total', () => {
    const items = [
      { completedAt: now, dueAt: null, label: 'A' },
      { completedAt: null, dueAt: null, label: 'B' },
      { completedAt: now, dueAt: null, label: 'C' },
    ];
    expect(summarizeChecklist(items)).toMatchObject({ total: 3, complete: 2 });
  });

  it('picks earliest dated open item as next', () => {
    const items = [
      { completedAt: null, dueAt: daysFromNow(10).toISOString(), label: 'Later' },
      { completedAt: null, dueAt: daysFromNow(2).toISOString(), label: 'Sooner' },
    ];
    expect(summarizeChecklist(items)?.nextLabel).toBe('Sooner');
  });

  it('flags overdue when any open item is past', () => {
    const items = [
      { completedAt: null, dueAt: daysFromNow(-2).toISOString(), label: 'Overdue' },
      { completedAt: null, dueAt: daysFromNow(5).toISOString(), label: 'Fine' },
    ];
    expect(summarizeChecklist(items)?.anyOverdue).toBe(true);
  });

  it('falls back to first open item when none have dueAt', () => {
    const items = [
      { completedAt: now, dueAt: null, label: 'Done' },
      { completedAt: null, dueAt: null, label: 'First open' },
    ];
    expect(summarizeChecklist(items)?.nextLabel).toBe('First open');
  });

  it('ignores completed items when finding next', () => {
    const items = [
      { completedAt: now, dueAt: daysFromNow(1).toISOString(), label: 'Complete soon' },
      { completedAt: null, dueAt: daysFromNow(5).toISOString(), label: 'Open later' },
    ];
    expect(summarizeChecklist(items)?.nextLabel).toBe('Open later');
  });
});
