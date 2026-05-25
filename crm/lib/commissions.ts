/**
 * Commission-split helpers: canonical party list + math for turning a deal
 * value + commission rate + splits into "net to me".
 *
 * The math is straightforward but important enough to centralise and test:
 *   gci     = dealValue * dealCommissionRate / 100
 *   gross split amount per row = basis==='percent' ? gci * percentOfGci/100 : flatAmount
 *   netToMe = gci - sum(all non-"me" split amounts) + sum("me" split amounts)
 *
 * The last bit deserves a note: by convention we *don't* require the realtor
 * to enter their own "me" row. If there are no rows, `netToMe === gci`. If
 * the realtor adds an explicit "me" row with a percentage, that's treated
 * as their slice and everything not assigned is considered overhead /
 * brokerage. This mirrors how most realtors actually model it: they enter
 * what they owe others and trust that what's left is theirs.
 */

export type CommissionParty =
  | 'me'
  | 'brokerage'
  | 'co_agent'
  | 'referral_out'
  | 'referral_in'
  | 'other';

export type CommissionBasis = 'percent' | 'flat';

export interface CommissionSplit {
  id: string;
  dealId: string;
  spaceId: string;
  party: CommissionParty;
  label: string;
  basis: CommissionBasis;
  percentOfGci: number | null;
  flatAmount: number | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const COMMISSION_PARTIES: { value: CommissionParty; label: string; description: string }[] = [
  { value: 'me',           label: 'Me',            description: 'Your take — explicit if you want to model it.' },
  { value: 'brokerage',    label: 'Brokerage',     description: 'Your office / brokerage split.' },
  { value: 'co_agent',     label: 'Co-agent',      description: 'Another agent on the same side of the deal.' },
  { value: 'referral_out', label: 'Referral out',  description: 'Another agent who sent you the client.' },
  { value: 'referral_in',  label: 'Referral in',   description: 'Someone you referred to — money in.' },
  { value: 'other',        label: 'Other',         description: 'Anything else that doesn\'t fit.' },
];

const PARTY_SET = new Set(COMMISSION_PARTIES.map((p) => p.value));
export function isValidCommissionParty(v: unknown): v is CommissionParty {
  return typeof v === 'string' && PARTY_SET.has(v as CommissionParty);
}

/**
 * Compute the concrete dollar amount of a split against a deal's GCI.
 * Returns 0 when inputs are missing rather than null — callers summing these
 * don't want to reason about nulls.
 */
export function splitAmount(split: Pick<CommissionSplit, 'basis' | 'percentOfGci' | 'flatAmount'>, gci: number): number {
  if (split.basis === 'percent') {
    if (split.percentOfGci == null) return 0;
    return (gci * split.percentOfGci) / 100;
  }
  return split.flatAmount ?? 0;
}

/**
 * Given a deal and its splits, return the full commission picture.
 *
 *   gci        — gross commission income (dealValue * dealCommissionRate / 100)
 *   outgoing   — dollars leaving for non-"me" parties
 *   mine       — dollars flagged as "me" on explicit rows
 *   net        — gci - outgoing + mine  (clamped at 0 floor)
 *
 * Unpaid vs. paid split totals make it easy to build a "waiting on"
 * column in the YTD view.
 */
export function computeCommission(
  dealValue: number | null,
  dealCommissionRate: number | null,
  splits: Pick<CommissionSplit, 'party' | 'basis' | 'percentOfGci' | 'flatAmount' | 'paidAt'>[],
) {
  const gci = dealValue != null && dealCommissionRate != null
    ? (dealValue * dealCommissionRate) / 100
    : 0;

  let outgoing = 0;
  let mine = 0;
  let outgoingPaid = 0;
  let outgoingUnpaid = 0;

  for (const s of splits) {
    const amount = splitAmount(s, gci);
    if (s.party === 'me' || s.party === 'referral_in') {
      mine += amount;
    } else {
      outgoing += amount;
      if (s.paidAt) outgoingPaid += amount;
      else outgoingUnpaid += amount;
    }
  }

  const net = Math.max(0, gci - outgoing + mine);
  return { gci, outgoing, mine, net, outgoingPaid, outgoingUnpaid };
}
