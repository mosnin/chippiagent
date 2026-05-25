import { describe, it, expect } from 'vitest';
import { computeCommission, splitAmount } from '@/lib/commissions';

describe('splitAmount', () => {
  it('computes percent against GCI', () => {
    expect(splitAmount({ basis: 'percent', percentOfGci: 40, flatAmount: null }, 10_000)).toBe(4_000);
  });

  it('returns the flat amount directly', () => {
    expect(splitAmount({ basis: 'flat', percentOfGci: null, flatAmount: 1_500 }, 10_000)).toBe(1_500);
  });

  it('returns 0 when percent basis has no percent', () => {
    expect(splitAmount({ basis: 'percent', percentOfGci: null, flatAmount: null }, 10_000)).toBe(0);
  });
});

describe('computeCommission', () => {
  it('returns zero everything when the deal has no value or rate', () => {
    expect(computeCommission(null, null, [])).toMatchObject({ gci: 0, net: 0, outgoing: 0 });
  });

  it('net equals gci when there are no splits', () => {
    const r = computeCommission(500_000, 3, []);
    expect(r.gci).toBeCloseTo(15_000);
    expect(r.net).toBeCloseTo(15_000);
  });

  it('subtracts outgoing splits from net', () => {
    const r = computeCommission(500_000, 3, [
      { party: 'brokerage', basis: 'percent', percentOfGci: 30, flatAmount: null, paidAt: null },
      { party: 'co_agent',  basis: 'percent', percentOfGci: 20, flatAmount: null, paidAt: null },
    ]);
    // gci=15k, outgoing = 30%+20% = 50% = 7.5k, net = 7.5k
    expect(r.gci).toBeCloseTo(15_000);
    expect(r.outgoing).toBeCloseTo(7_500);
    expect(r.net).toBeCloseTo(7_500);
  });

  it('flat-amount splits work alongside percent ones', () => {
    const r = computeCommission(500_000, 3, [
      { party: 'brokerage',    basis: 'percent', percentOfGci: 30, flatAmount: null, paidAt: null },
      { party: 'referral_out', basis: 'flat',    percentOfGci: null, flatAmount: 750, paidAt: null },
    ]);
    // gci=15k, outgoing = 4500 + 750 = 5250
    expect(r.net).toBeCloseTo(15_000 - 5_250);
  });

  it('treats me / referral_in as additive to net (not subtracted)', () => {
    const r = computeCommission(500_000, 3, [
      { party: 'brokerage',   basis: 'percent', percentOfGci: 30, flatAmount: null, paidAt: null },
      { party: 'referral_in', basis: 'flat',    percentOfGci: null, flatAmount: 1_000, paidAt: null },
    ]);
    // gci=15k, outgoing=4500, mine=1000, net = gci - outgoing + mine = 15000-4500+1000 = 11500
    expect(r.net).toBeCloseTo(11_500);
  });

  it('tracks paid vs unpaid outgoing separately', () => {
    const r = computeCommission(500_000, 3, [
      { party: 'brokerage', basis: 'percent', percentOfGci: 30, flatAmount: null, paidAt: new Date().toISOString() },
      { party: 'co_agent',  basis: 'percent', percentOfGci: 20, flatAmount: null, paidAt: null },
    ]);
    expect(r.outgoingPaid).toBeCloseTo(4_500);
    expect(r.outgoingUnpaid).toBeCloseTo(3_000);
  });

  it('clamps net at zero (no negative take-home)', () => {
    const r = computeCommission(100_000, 3, [
      { party: 'other', basis: 'flat', percentOfGci: null, flatAmount: 10_000, paidAt: null },
    ]);
    // gci=3k, outgoing=10k, net floors at 0
    expect(r.net).toBe(0);
  });
});
