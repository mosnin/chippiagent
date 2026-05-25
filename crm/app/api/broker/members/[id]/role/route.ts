import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requireBroker, canManageRoles, canChangeRole } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { audit } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/broker/members/[id]/role
 * Change a member's role. Only broker_owner or broker_admin can do this.
 * Cannot change the owner's role. Admins cannot change other admins' roles.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { userId: clerkId } = await auth();
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!canManageRoles(ctx.membership.role)) {
    return NextResponse.json({ error: 'Only the owner or admins can change roles' }, { status: 403 });
  }

  const { id: membershipId } = await params;

  // Prevent actors from changing their own role (self-escalation / accidental self-demotion)
  if (membershipId === ctx.membership.id) {
    return NextResponse.json({ error: 'You cannot change your own role' }, { status: 403 });
  }

  let role: string;
  try {
    ({ role } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!['broker_admin', 'realtor_member'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role. Must be broker_admin or realtor_member.' }, { status: 400 });
  }

  // Fetch the membership
  const { data: membership } = await supabase
    .from('BrokerageMembership')
    .select('id, userId, role')
    .eq('id', membershipId)
    .eq('brokerageId', ctx.brokerage.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  // Use centralized permission check: owner can change any non-owner, admin can only change realtor_member
  if (!canChangeRole(ctx.membership.role, membership.role)) {
    const msg = membership.role === 'broker_owner'
      ? 'Cannot change the owner\'s role'
      : 'Only the owner can change admin roles';
    return NextResponse.json({ error: msg }, { status: 403 });
  }

  if (membership.role === role) {
    return NextResponse.json({ message: 'Role unchanged' }, { status: 200 });
  }

  // Scope the update to both the membership ID and brokerage ID to prevent
  // a TOCTOU race where membership might have moved brokerages between the
  // fetch above and this write.
  const { error: updateErr } = await supabase
    .from('BrokerageMembership')
    .update({ role })
    .eq('id', membershipId)
    .eq('brokerageId', ctx.brokerage.id);

  if (updateErr) {
    console.error('[broker/members/role] update failed', updateErr);
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
  }

  void audit({
    actorClerkId: clerkId ?? null,
    action: 'UPDATE',
    resource: 'BrokerageMembership',
    resourceId: membershipId,
    metadata: { brokerageId: ctx.brokerage.id, previousRole: membership.role, newRole: role },
  });

  return NextResponse.json({ success: true, role });
}
