import { NextRequest, NextResponse } from 'next/server';
import { requireBroker, canManageLeads } from '@/lib/permissions';
import { assignLeadToRealtor } from '@/lib/broker-assign-lead';
import { z } from 'zod';

const assignLeadSchema = z.object({
  contactId: z.string().uuid('Invalid contact ID'),
  realtorUserId: z.string().uuid('Invalid realtor user ID'),
});

/**
 * POST /api/broker/assign-lead
 *
 * Assigns a brokerage lead (Contact) from the broker's space to a realtor's
 * space. Only broker_owner and broker_admin roles can perform this action.
 *
 * The assignment itself lives in assignLeadToRealtor() (lib/broker-assign-lead)
 * so the /assign team-chat command can reuse it without an internal HTTP hop.
 */
export async function POST(req: NextRequest) {
  // ── Auth: require broker_owner or broker_admin ───────────────────────────
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Role check: only broker_owner and broker_admin can assign leads ─────
  if (!canManageLeads(ctx.membership.role)) {
    return NextResponse.json(
      { error: 'Only the owner or admins can assign leads' },
      { status: 403 },
    );
  }

  // ── Parse request body ───────────────────────────────────────────────────
  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = assignLeadSchema.safeParse(requestBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request data', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { contactId, realtorUserId } = parsed.data;

  try {
    const result = await assignLeadToRealtor({
      brokerage: ctx.brokerage,
      assignedByUserId: ctx.dbUserId,
      contactId,
      realtorUserId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(
      {
        success: true,
        newContactId: result.newContactId,
        assignedTo: realtorUserId,
        assignedToSpaceId: result.assignedToSpaceId,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[assign-lead] unhandled error', {
      contactId,
      realtorUserId,
      brokerageId: ctx.brokerage.id,
      error,
    });
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 });
  }
}
