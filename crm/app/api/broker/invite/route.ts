import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { sendBrokerageInvitation } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { checkSeatCapacity } from '@/lib/brokerage-seats';

/**
 * POST /api/broker/invite
 * Send a brokerage invitation to an email address.
 * Idempotent: if a pending invite for the same email already exists, returns it without
 * creating a duplicate or sending another email.
 */
export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let email: string, roleToAssign: string;
  try {
    ({ email, roleToAssign } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Validate inputs
  const trimmedEmail = (email ?? '').trim().toLowerCase().slice(0, 320);
  if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }
  if (!['broker_admin', 'realtor_member'].includes(roleToAssign)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  // Only the owner can invite admins
  if (roleToAssign === 'broker_admin' && ctx.membership.role !== 'broker_owner') {
    return NextResponse.json({ error: 'Only the brokerage owner can invite admins' }, { status: 403 });
  }

  // 100 invitations per broker per hour (shared budget with /api/broker/invite/bulk)
  const { allowed } = await checkRateLimit(`broker:invite:${ctx.dbUserId}`, 100, 3600);
  if (!allowed) return NextResponse.json({ error: 'Too many invitations sent. Try again in an hour.' }, { status: 429 });

  const { brokerage, dbUserId } = ctx;

  // Cap: max 100 pending invitations per brokerage
  const { count: pendingCount } = await supabase
    .from('Invitation')
    .select('*', { count: 'exact', head: true })
    .eq('brokerageId', brokerage.id)
    .eq('status', 'pending');
  if ((pendingCount ?? 0) >= 100) {
    return NextResponse.json(
      { error: 'Too many pending invitations. Cancel some before sending more.' },
      { status: 429 }
    );
  }

  // Check if this email already belongs to a member
  const { data: existingUser } = await supabase
    .from('User')
    .select('id')
    .eq('email', trimmedEmail)
    .maybeSingle();
  if (existingUser) {
    const { data: existingMember } = await supabase
      .from('BrokerageMembership')
      .select('id')
      .eq('brokerageId', brokerage.id)
      .eq('userId', existingUser.id)
      .maybeSingle();
    if (existingMember) {
      return NextResponse.json({ error: 'This person is already a member of your brokerage' }, { status: 409 });
    }
  }

  // Idempotency: return existing pending invite for this email, but resend the email
  const { data: existing } = await supabase
    .from('Invitation')
    .select('*')
    .eq('brokerageId', brokerage.id)
    .eq('email', trimmedEmail)
    .eq('status', 'pending')
    .maybeSingle();
  if (existing) {
    // Resend the invitation email (original may have failed or been missed)
    try {
      await sendBrokerageInvitation({
        toEmail: trimmedEmail,
        brokerageName: brokerage.name,
        inviterName: (await supabase.from('User').select('name, email').eq('id', dbUserId).maybeSingle()).data?.name ?? 'Someone',
        roleToAssign: existing.roleToAssign as 'broker_admin' | 'realtor_member',
        token: existing.token,
      });
    } catch (err) {
      console.error('[broker/invite] resend email failed for existing invite', err);
    }
    return NextResponse.json({ invitation: existing, duplicate: true }, { status: 200 });
  }

  // Seat-limit enforcement (BP3b): duplicates above returned early and don't
  // consume a new seat, so we only gate genuinely new invitations.
  const seatCheck = await checkSeatCapacity(brokerage.id, 1);
  if (!seatCheck.ok) {
    const { plan, seatLimit, used } = seatCheck.usage;
    const needed = seatCheck.needed ?? 1;
    return NextResponse.json(
      {
        error: `Seat limit reached — your ${plan} plan allows ${seatLimit} seats and ${used} are in use. Upgrade or remove a member to invite ${needed} more.`,
        code: 'seat_limit',
        plan,
        used,
        limit: seatLimit,
        needed,
      },
      { status: 402 }
    );
  }

  // Resolve inviter name for email
  const { data: inviterUser } = await supabase
    .from('User')
    .select('name, email')
    .eq('id', dbUserId)
    .maybeSingle();
  const inviterName = inviterUser?.name ?? inviterUser?.email ?? 'Someone';

  // Create invitation
  const { data: invitation, error: invErr } = await supabase
    .from('Invitation')
    .insert({
      brokerageId: brokerage.id,
      email: trimmedEmail,
      roleToAssign,
      invitedById: dbUserId,
    })
    .select()
    .single();
  if (invErr || !invitation) {
    console.error('[broker/invite] insert failed', invErr);
    return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 });
  }

  console.log('[broker/invite] Invitation created:', { id: invitation.id, role: roleToAssign });

  // Send email — must await before response returns so Vercel doesn't kill the function
  try {
    console.log('[broker/invite] Sending invitation email for invitation:', invitation.id);
    const emailResult = await sendBrokerageInvitation({
      toEmail: trimmedEmail,
      brokerageName: brokerage.name,
      inviterName,
      roleToAssign: roleToAssign as 'broker_admin' | 'realtor_member',
      token: invitation.token,
    });
    console.log('[broker/invite] Email send completed for invitation:', invitation.id);
  } catch (err) {
    console.error('[broker/invite] email send FAILED:', err instanceof Error ? err.message : err);
  }

  void audit({ actorClerkId: clerkId ?? null, action: 'CREATE', resource: 'Invitation', resourceId: invitation.id, metadata: { email: trimmedEmail, roleToAssign, brokerageId: brokerage.id } });

  return NextResponse.json({ invitation }, { status: 201 });
}
