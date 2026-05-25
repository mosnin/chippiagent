import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { notifyBroker } from '@/lib/broker-notify';
import { notificationForMemberJoined } from '@/lib/notification-voice';

/**
 * POST /api/broker/join
 * Join a brokerage using its invite code.
 * Any authenticated, onboarded user can join. Assigns role: realtor_member.
 */
export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 10 join attempts per user per hour (prevents code enumeration)
  const { allowed } = await checkRateLimit(`broker:join:${clerkId}`, 10, 3600);
  if (!allowed) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });

  let code: string;
  try {
    ({ code } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const normalizedCode = (code ?? '').trim().toUpperCase();
  if (!normalizedCode) {
    return NextResponse.json({ error: 'Invite code required' }, { status: 400 });
  }

  // Resolve current user
  const { data: user } = await supabase
    .from('User')
    .select('id, onboard')
    .eq('clerkId', clerkId)
    .maybeSingle();
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (!user.onboard) return NextResponse.json({ error: 'Complete onboarding before joining a brokerage' }, { status: 403 });

  // Find brokerage by code
  const { data: brokerage } = await supabase
    .from('Brokerage')
    .select('id, name, status')
    .eq('joinCode', normalizedCode)
    .maybeSingle();

  if (!brokerage) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 });
  }

  if (brokerage.status === 'suspended') {
    return NextResponse.json({ error: 'This brokerage is currently suspended' }, { status: 403 });
  }

  // Idempotent: already a member?
  const { data: existing } = await supabase
    .from('BrokerageMembership')
    .select('id, role')
    .eq('brokerageId', brokerage.id)
    .eq('userId', user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ brokerageName: brokerage.name, alreadyMember: true }, { status: 200 });
  }

  // Create membership
  const { error: memberErr } = await supabase
    .from('BrokerageMembership')
    .insert({ brokerageId: brokerage.id, userId: user.id, role: 'realtor_member' });

  if (memberErr) {
    console.error('[broker/join] membership insert failed', memberErr);
    return NextResponse.json({ error: 'Failed to join brokerage' }, { status: 500 });
  }

  // Link the user's Space to this brokerage (best-effort)
  const { data: space } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', user.id)
    .maybeSingle();
  if (space) {
    await supabase.from('Space').update({ brokerageId: brokerage.id }).eq('id', space.id);
  }

  void audit({ actorClerkId: clerkId, action: 'CREATE', resource: 'BrokerageMembership', metadata: { brokerageId: brokerage.id, role: 'realtor_member', method: 'join_code' } });

  // Resolve user email for notification
  const { data: userData } = await supabase.from('User').select('email').eq('id', user.id).maybeSingle();
  const joinCopy = notificationForMemberJoined(
    userData?.email ?? 'A new member',
    'realtor_member',
    'join_code',
  );
  void notifyBroker({
    brokerageId: brokerage.id,
    type: 'member_joined',
    title: joinCopy.title,
    body: joinCopy.description,
    metadata: { userId: user.id, method: 'join_code' },
  });

  return NextResponse.json({ brokerageName: brokerage.name }, { status: 201 });
}
