import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { sendBrokerageInvitation } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { checkSeatCapacity } from '@/lib/brokerage-seats';

/**
 * POST /api/broker/invite/bulk
 * Send multiple brokerage invitations from a list of emails.
 * Max 50 per request.
 */
export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let entries: Array<{ email: string; role?: string }>;
  try {
    const body = await req.json();
    entries = body.entries;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: 'No entries provided' }, { status: 400 });
  }

  if (entries.length > 50) {
    return NextResponse.json({ error: 'Max 50 invitations per batch' }, { status: 400 });
  }

  // Rate limit: consume one token per invitation in this batch so that bulk
  // requests can't bypass the shared 100-per-hour budget with a single API call.
  // We loop up to entries.length times, stopping as soon as a call is denied.
  let rateLimited = false;
  for (let i = 0; i < entries.length; i++) {
    const { allowed } = await checkRateLimit(`broker:invite:${ctx.dbUserId}`, 100, 3600);
    if (!allowed) {
      rateLimited = true;
      break;
    }
  }
  if (rateLimited) {
    return NextResponse.json({ error: 'Too many invitations. Try again in an hour.' }, { status: 429 });
  }

  const { brokerage, dbUserId } = ctx;

  // Check pending capacity
  const { count: pendingCount } = await supabase
    .from('Invitation')
    .select('*', { count: 'exact', head: true })
    .eq('brokerageId', brokerage.id)
    .eq('status', 'pending');
  const remaining = 100 - (pendingCount ?? 0);
  if (remaining <= 0) {
    return NextResponse.json({ error: 'Too many pending invitations. Cancel some first.' }, { status: 429 });
  }

  // Seat-limit enforcement (BP3b): check once against the full requested count
  // so the batch is atomic — either everything fits under the plan cap or the
  // whole request is rejected. No partial commits.
  const seatCheck = await checkSeatCapacity(brokerage.id, entries.length);
  if (!seatCheck.ok) {
    const { plan, seatLimit, used } = seatCheck.usage;
    const needed = seatCheck.needed ?? entries.length;
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

  // Resolve inviter name
  const { data: inviterUser } = await supabase
    .from('User')
    .select('name, email')
    .eq('id', dbUserId)
    .maybeSingle();
  const inviterName = inviterUser?.name ?? inviterUser?.email ?? 'Someone';

  const results: Array<{ email: string; status: 'sent' | 'duplicate' | 'error'; error?: string }> = [];
  let sentCount = 0;

  for (const entry of entries) {
    if (sentCount >= remaining) {
      results.push({ email: entry.email, status: 'error', error: 'Pending invite limit reached' });
      continue;
    }

    const email = (entry.email ?? '').trim().toLowerCase().slice(0, 320);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      results.push({ email: entry.email ?? '', status: 'error', error: 'Invalid email' });
      continue;
    }

    const roleToAssign = entry.role === 'broker_admin' ? 'broker_admin' : 'realtor_member';

    // Only the owner can invite admins
    if (roleToAssign === 'broker_admin' && ctx.membership.role !== 'broker_owner') {
      results.push({ email, status: 'error', error: 'Only the owner can invite admins' });
      continue;
    }

    // Check if already a member
    const { data: existingUser } = await supabase.from('User').select('id').eq('email', email).maybeSingle();
    if (existingUser) {
      const { data: existingMember } = await supabase
        .from('BrokerageMembership')
        .select('id')
        .eq('brokerageId', brokerage.id)
        .eq('userId', existingUser.id)
        .maybeSingle();
      if (existingMember) {
        results.push({ email, status: 'duplicate' });
        continue;
      }
    }

    // Check for existing pending invite
    const { data: existing } = await supabase
      .from('Invitation')
      .select('id')
      .eq('brokerageId', brokerage.id)
      .eq('email', email)
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) {
      results.push({ email, status: 'duplicate' });
      continue;
    }

    // Create invitation
    const { data: invitation, error: invErr } = await supabase
      .from('Invitation')
      .insert({
        brokerageId: brokerage.id,
        email,
        roleToAssign,
        invitedById: dbUserId,
      })
      .select()
      .single();

    if (invErr || !invitation) {
      results.push({ email, status: 'error', error: 'Insert failed' });
      continue;
    }

    // Send email — must await so Vercel doesn't kill the function before delivery
    try {
      await sendBrokerageInvitation({
        toEmail: email,
        brokerageName: brokerage.name,
        inviterName,
        roleToAssign: roleToAssign as 'broker_admin' | 'realtor_member',
        token: invitation.token,
      });
    } catch (err) {
      console.error('[broker/invite/bulk] email failed', err);
    }

    results.push({ email, status: 'sent' });
    sentCount++;
  }

  void audit({
    actorClerkId: clerkId ?? null,
    action: 'CREATE',
    resource: 'Invitation',
    metadata: { bulk: true, count: sentCount, brokerageId: brokerage.id },
  });

  return NextResponse.json({
    sent: results.filter((r) => r.status === 'sent').length,
    duplicates: results.filter((r) => r.status === 'duplicate').length,
    errors: results.filter((r) => r.status === 'error').length,
    results,
  }, { status: 201 });
}
