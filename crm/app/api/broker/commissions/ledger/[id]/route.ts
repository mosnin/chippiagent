import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { audit } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

type LedgerStatus = 'pending' | 'paid' | 'void';

interface CommissionLedgerRow {
  id: string;
  brokerageId: string;
  agentUserId: string;
  dealId: string;
  closedAt: string;
  dealValue: number;
  agentRate: number;
  brokerRate: number;
  referralRate: number;
  referralUserId: string | null;
  agentAmount: number;
  brokerAmount: number;
  referralAmount: number;
  status: LedgerStatus;
  payoutAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const VALID_STATUSES: readonly LedgerStatus[] = ['pending', 'paid', 'void'] as const;

function isValidStatus(v: unknown): v is LedgerStatus {
  return typeof v === 'string' && (VALID_STATUSES as readonly string[]).includes(v);
}

function isValidRate(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
}

/**
 * PATCH /api/broker/commissions/ledger/[id]
 * Update a commission-ledger row. Only broker_owner / broker_admin may call.
 *
 * Body (any subset):
 *   { status?, payoutAt?, agentRate?, brokerRate?, referralRate?,
 *     referralUserId?, notes? }
 *
 * Amounts (agentAmount / brokerAmount / referralAmount) are recomputed from
 * the existing dealValue whenever any rate changes. Returns the full updated
 * row on success.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { userId: clerkId } = await auth();

  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (ctx.membership.role !== 'broker_owner' && ctx.membership.role !== 'broker_admin') {
    return NextResponse.json({ error: 'Only the owner or admins can update the commission ledger' }, { status: 403 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Detect which fields were provided. `undefined` means "not provided";
  // `null` is a legitimate clear for payoutAt / referralUserId / notes.
  const hasStatus = Object.prototype.hasOwnProperty.call(body, 'status');
  const hasPayoutAt = Object.prototype.hasOwnProperty.call(body, 'payoutAt');
  const hasAgentRate = Object.prototype.hasOwnProperty.call(body, 'agentRate');
  const hasBrokerRate = Object.prototype.hasOwnProperty.call(body, 'brokerRate');
  const hasReferralRate = Object.prototype.hasOwnProperty.call(body, 'referralRate');
  const hasReferralUserId = Object.prototype.hasOwnProperty.call(body, 'referralUserId');
  const hasNotes = Object.prototype.hasOwnProperty.call(body, 'notes');

  const hasAnyField =
    hasStatus ||
    hasPayoutAt ||
    hasAgentRate ||
    hasBrokerRate ||
    hasReferralRate ||
    hasReferralUserId ||
    hasNotes;

  if (!hasAnyField) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  // Validate status.
  let statusVal: LedgerStatus | undefined;
  if (hasStatus) {
    if (!isValidStatus(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    statusVal = body.status;
  }

  // Validate payoutAt. null clears; string must parse as a date.
  let payoutAtVal: string | null | undefined;
  if (hasPayoutAt) {
    const raw = body.payoutAt;
    if (raw === null) {
      payoutAtVal = null;
    } else if (typeof raw === 'string') {
      const d = new Date(raw);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Invalid payoutAt' }, { status: 400 });
      }
      payoutAtVal = d.toISOString();
    } else {
      return NextResponse.json({ error: 'Invalid payoutAt' }, { status: 400 });
    }
  }

  // Validate rates.
  let agentRateVal: number | undefined;
  if (hasAgentRate) {
    if (!isValidRate(body.agentRate)) {
      return NextResponse.json({ error: 'Invalid agentRate (must be 0-100)' }, { status: 400 });
    }
    agentRateVal = body.agentRate;
  }
  let brokerRateVal: number | undefined;
  if (hasBrokerRate) {
    if (!isValidRate(body.brokerRate)) {
      return NextResponse.json({ error: 'Invalid brokerRate (must be 0-100)' }, { status: 400 });
    }
    brokerRateVal = body.brokerRate;
  }
  let referralRateVal: number | undefined;
  if (hasReferralRate) {
    if (!isValidRate(body.referralRate)) {
      return NextResponse.json({ error: 'Invalid referralRate (must be 0-100)' }, { status: 400 });
    }
    referralRateVal = body.referralRate;
  }

  // Validate referralUserId. null clears; string must be provided.
  let referralUserIdVal: string | null | undefined;
  if (hasReferralUserId) {
    const raw = body.referralUserId;
    if (raw === null) {
      referralUserIdVal = null;
    } else if (typeof raw === 'string' && raw.length > 0) {
      referralUserIdVal = raw;
    } else {
      return NextResponse.json({ error: 'Invalid referralUserId' }, { status: 400 });
    }
  }

  // Validate notes. null clears; otherwise slice to 1000 chars (deals-route style).
  let notesVal: string | null | undefined;
  if (hasNotes) {
    const raw = body.notes;
    if (raw === null) {
      notesVal = null;
    } else if (typeof raw === 'string') {
      notesVal = raw.slice(0, 1000);
    } else {
      return NextResponse.json({ error: 'Invalid notes' }, { status: 400 });
    }
  }

  // Load the ledger row; must belong to this brokerage.
  const { data: existing, error: fetchErr } = await supabase
    .from('CommissionLedger')
    .select('*')
    .eq('id', id)
    .eq('brokerageId', ctx.brokerage.id)
    .maybeSingle();

  if (fetchErr) {
    console.error('[broker/commissions/ledger/PATCH] fetch failed', fetchErr);
    return NextResponse.json({ error: 'Failed to fetch ledger entry' }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ error: 'Ledger entry not found' }, { status: 404 });
  }

  const row = existing as CommissionLedgerRow;

  // If a referralUserId was supplied (and not null), the User must exist.
  if (referralUserIdVal !== undefined && referralUserIdVal !== null) {
    const { data: userRow, error: userErr } = await supabase
      .from('User')
      .select('id')
      .eq('id', referralUserIdVal)
      .maybeSingle();
    if (userErr) {
      console.error('[broker/commissions/ledger/PATCH] user lookup failed', userErr);
      return NextResponse.json({ error: 'Failed to validate referralUserId' }, { status: 500 });
    }
    if (!userRow) {
      return NextResponse.json({ error: 'Referral user not found' }, { status: 404 });
    }
  }

  // Recompute amounts if any rate changed. Use existing dealValue (never a body field).
  const rateChanged = hasAgentRate || hasBrokerRate || hasReferralRate;
  const effectiveAgentRate = agentRateVal ?? row.agentRate;
  const effectiveBrokerRate = brokerRateVal ?? row.brokerRate;
  const effectiveReferralRate = referralRateVal ?? row.referralRate;
  const dealValue = row.dealValue;

  // Audit found: individually-capped rates (0-100 each) still allow a broker
  // to allocate >100% of dealValue. Cap the SUM at 100% so the ledger never
  // shows a payout that exceeds the deal.
  const rateSum =
    (effectiveAgentRate ?? 0) +
    (effectiveBrokerRate ?? 0) +
    (effectiveReferralRate ?? 0);
  if (rateSum > 100) {
    return NextResponse.json(
      {
        error: `Rates sum to ${rateSum}% — agent + broker + referral cannot exceed 100% of the deal value.`,
      },
      { status: 400 },
    );
  }

  // Referral pair invariant: a non-zero referralRate is meaningless without
  // a referralUserId. Effective values (after merging the patch over the
  // current row) are what matters.
  const effectiveReferralUserId =
    referralUserIdVal !== undefined ? referralUserIdVal : row.referralUserId;
  if ((effectiveReferralRate ?? 0) > 0 && !effectiveReferralUserId) {
    return NextResponse.json(
      {
        error:
          'referralRate > 0 requires referralUserId — payouts cannot be recorded without a recipient.',
      },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (statusVal !== undefined) updates.status = statusVal;
  if (payoutAtVal !== undefined) updates.payoutAt = payoutAtVal;
  if (agentRateVal !== undefined) updates.agentRate = agentRateVal;
  if (brokerRateVal !== undefined) updates.brokerRate = brokerRateVal;
  if (referralRateVal !== undefined) updates.referralRate = referralRateVal;
  if (referralUserIdVal !== undefined) updates.referralUserId = referralUserIdVal;
  if (notesVal !== undefined) updates.notes = notesVal;

  if (rateChanged) {
    updates.agentAmount = (dealValue * effectiveAgentRate) / 100;
    updates.brokerAmount = (dealValue * effectiveBrokerRate) / 100;
    updates.referralAmount = (dealValue * effectiveReferralRate) / 100;
  }

  // Scope the update to brokerageId to guard against TOCTOU races.
  const { data: updated, error: updateErr } = await supabase
    .from('CommissionLedger')
    .update(updates)
    .eq('id', id)
    .eq('brokerageId', ctx.brokerage.id)
    .select('*')
    .maybeSingle();

  if (updateErr) {
    console.error('[broker/commissions/ledger/PATCH] update failed', updateErr);
    return NextResponse.json({ error: 'Failed to update ledger entry' }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json({ error: 'Ledger entry not found' }, { status: 404 });
  }

  void audit({
    actorClerkId: clerkId ?? null,
    action: 'UPDATE',
    resource: 'CommissionLedger',
    resourceId: id,
    spaceId: undefined,
    req,
  });

  return NextResponse.json(updated as CommissionLedgerRow);
}
