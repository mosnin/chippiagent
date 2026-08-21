import { describe, it, expect } from 'vitest';
import { isActiveTourStatus, tourRangesOverlap } from '@/lib/tour-slot';

describe('tourRangesOverlap', () => {
  const a = '2026-08-21T15:00:00.000Z';
  const b = '2026-08-21T15:30:00.000Z';
  const c = '2026-08-21T16:00:00.000Z';
  const d = '2026-08-21T16:30:00.000Z';

  it('detects a partial overlap (the double-book case)', () => {
    expect(tourRangesOverlap(a, c, b, d)).toBe(true);
    expect(tourRangesOverlap(b, d, a, c)).toBe(true);
  });

  it('treats an exact same window as a conflict', () => {
    expect(tourRangesOverlap(a, b, a, b)).toBe(true);
  });

  it('allows back-to-back tours that only touch at the edge', () => {
    expect(tourRangesOverlap(a, b, b, c)).toBe(false);
    expect(tourRangesOverlap(b, c, a, b)).toBe(false);
  });

  it('allows a later non-overlapping window', () => {
    expect(tourRangesOverlap(a, b, c, d)).toBe(false);
  });
});

describe('isActiveTourStatus', () => {
  it('only scheduled and confirmed occupy a slot', () => {
    expect(isActiveTourStatus('scheduled')).toBe(true);
    expect(isActiveTourStatus('confirmed')).toBe(true);
    expect(isActiveTourStatus('completed')).toBe(false);
    expect(isActiveTourStatus('cancelled')).toBe(false);
    expect(isActiveTourStatus('no_show')).toBe(false);
  });
});
