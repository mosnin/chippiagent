import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { audit } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/broker/members/[id]
 * Remove a member from the brokerage. Owner or admin can remove members.
 * The owner cannot remove themselves. Admins cannot remove other admins.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { userId: clerkId } = await auth();
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const isOwner = ctx.membership.role === 'broker_owner';
  const isAdmin = ctx.membership.role === 'broker_admin';
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Only the owner or admins can remove members' }, { status: 403 });
  }

  const { id: membershipId } = await params;

  // Fetch the membership to validate it belongs to this brokerage
  const { data: membership } = await supabase
    .from('BrokerageMembership')
    .select('id, userId, role')
    .eq('id', membershipId)
    .eq('brokerageId', ctx.brokerage.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  if (membership.role === 'broker_owner') {
    return NextResponse.json({ error: 'Cannot remove the brokerage owner' }, { status: 400 });
  }

  // Admins can only remove realtors, not other admins
  if (isAdmin && membership.role === 'broker_admin') {
    return NextResponse.json({ error: 'Only the owner can remove admins' }, { status: 403 });
  }

  // Delete the membership — scope to brokerageId as well to prevent a TOCTOU
  // race between the fetch above and this write.
  const { error: deleteErr } = await supabase
    .from('BrokerageMembership')
    .delete()
    .eq('id', membershipId)
    .eq('brokerageId', ctx.brokerage.id);

  if (deleteErr) {
    console.error('[broker/members/delete] delete failed', deleteErr);
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
  }

  // Best-effort: unlink their Space from this brokerage
  await supabase
    .from('Space')
    .update({ brokerageId: null })
    .eq('ownerId', membership.userId)
    .eq('brokerageId', ctx.brokerage.id);

  void audit({ actorClerkId: clerkId ?? null, action: 'DELETE', resource: 'BrokerageMembership', resourceId: membershipId, metadata: { brokerageId: ctx.brokerage.id, removedUserId: membership.userId, role: membership.role } });

  return NextResponse.json({ success: true });
}
