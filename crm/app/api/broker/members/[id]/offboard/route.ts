import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { audit, type AuditAction } from '@/lib/audit';
import { logger } from '@/lib/logger';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/broker/members/[id]/offboard
 * Transfer a member's contacts, deals, and open tours to a destination member
 * and offboard them from the brokerage.
 *
 * Only broker_owner can offboard a member. The owner cannot be offboarded,
 * the caller cannot offboard themselves, and the destination must be a
 * different, active user in the same brokerage.
 *
 * Body: { destinationMembershipId: string; dryRun?: boolean }
 *
 * When dryRun is true, returns the counts of what would move without
 * applying any changes.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { userId: clerkId } = await auth();

  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Only the brokerage owner can offboard members.
  if (ctx.membership.role !== 'broker_owner') {
    return NextResponse.json({ error: 'Only the owner can offboard members' }, { status: 403 });
  }

  const { id: membershipId } = await params;

  // Parse body.
  let body: { destinationMembershipId?: unknown; dryRun?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const destinationMembershipId = body?.destinationMembershipId;
  if (typeof destinationMembershipId !== 'string' || destinationMembershipId.length === 0) {
    return NextResponse.json({ error: 'destinationMembershipId is required' }, { status: 400 });
  }

  // Load the target membership, scoped to this brokerage.
  const { data: target } = await supabase
    .from('BrokerageMembership')
    .select('id, userId, role')
    .eq('id', membershipId)
    .eq('brokerageId', ctx.brokerage.id)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  // Load the destination membership, scoped to this brokerage.
  const { data: destination } = await supabase
    .from('BrokerageMembership')
    .select('id, userId, role')
    .eq('id', destinationMembershipId)
    .eq('brokerageId', ctx.brokerage.id)
    .maybeSingle();

  if (!destination) {
    return NextResponse.json({ error: 'Destination not found' }, { status: 404 });
  }

  if (target.id === destination.id) {
    return NextResponse.json({ error: 'Destination must be a different member' }, { status: 400 });
  }

  if (target.role === 'broker_owner') {
    return NextResponse.json({ error: 'Cannot offboard the brokerage owner' }, { status: 403 });
  }

  if (target.userId === ctx.dbUserId) {
    return NextResponse.json({ error: 'Cannot offboard yourself' }, { status: 400 });
  }

  // Load both users for name resolution + destination status check.
  const { data: users } = await supabase
    .from('User')
    .select('id, name, email, status')
    .in('id', [target.userId, destination.userId]);

  const leavingUser = users?.find((u) => u.id === target.userId) ?? null;
  const destinationUser = users?.find((u) => u.id === destination.userId) ?? null;

  if (!destinationUser || destinationUser.status !== 'active') {
    return NextResponse.json({ error: 'Destination is not an active user' }, { status: 409 });
  }

  const dryRun = Boolean(body?.dryRun);

  // Execute the transfer via the Postgres RPC (handles the real transaction).
  const { data: rpcData, error: rpcError } = await supabase.rpc('offboard_brokerage_member', {
    p_leaving_user_id: target.userId,
    p_destination_user_id: destination.userId,
    p_brokerage_id: ctx.brokerage.id,
    p_dry_run: dryRun,
  });

  if (rpcError) {
    logger.error('[broker/members/offboard] rpc failed', {
      brokerageId: ctx.brokerage.id,
      targetMembershipId: target.id,
      destinationMembershipId: destination.id,
      dryRun,
    }, rpcError);
    return NextResponse.json({ error: 'Transfer failed' }, { status: 500 });
  }

  // Normalize the rpc payload — Supabase returns either a single row or an array
  // depending on how the function is defined. We accept both.
  const payload = (Array.isArray(rpcData) ? rpcData[0] : rpcData) ?? {};

  if (dryRun) {
    const displayName = (u: { name: string | null; email: string | null } | null): string | null => {
      if (!u) return null;
      return u.name ?? u.email ?? null;
    };

    return NextResponse.json({
      dryRun: true,
      contactCount: Number(payload.contact_count ?? payload.contactCount ?? 0),
      dealCount: Number(payload.deal_count ?? payload.dealCount ?? 0),
      openTourCount: Number(payload.open_tour_count ?? payload.openTourCount ?? 0),
      leavingUserName: displayName(leavingUser),
      destinationUserName: displayName(destinationUser),
    });
  }

  // Real-run: fire-and-forget audit.
  void audit({
    actorClerkId: clerkId ?? null,
    action: 'OFFBOARD',
    resource: 'BrokerageMembership',
    resourceId: target.id,
    spaceId: undefined,
    req,
  });

  return NextResponse.json({
    dryRun: false,
    contactsMoved: Number(payload.contacts_moved ?? payload.contactsMoved ?? 0),
    dealsMoved: Number(payload.deals_moved ?? payload.dealsMoved ?? 0),
    toursMoved: Number(payload.tours_moved ?? payload.toursMoved ?? 0),
  });
}
