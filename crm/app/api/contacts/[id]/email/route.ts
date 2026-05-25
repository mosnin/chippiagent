import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { sendEmailFromCRM } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // Rate limit: max 20 emails per user per hour
  const { allowed } = await checkRateLimit(`email:${userId}`, 20, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 });
  }

  const { id } = await params;

  // Get space first, then query contact scoped to that space to prevent
  // cross-tenant information disclosure.
  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: contactRows, error: contactError } = await supabase
    .from('Contact')
    .select('spaceId, name, email')
    .eq('id', id)
    .eq('spaceId', space.id)
    .limit(1);
  if (contactError) throw contactError;
  if (!contactRows?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const contact = contactRows[0];
  if (!contact.email) return NextResponse.json({ error: 'Contact has no email' }, { status: 400 });

  // Get the user's email to use as reply-to
  const { data: userRows } = await supabase
    .from('User')
    .select('email, name')
    .eq('clerkId', userId)
    .limit(1);
  const user = userRows?.[0];

  const body = await req.json();
  const { subject, body: emailBody } = body;

  if (!subject?.trim() || !emailBody?.trim()) {
    return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 });
  }

  await sendEmailFromCRM({
    toEmail: contact.email,
    fromName: user?.name ?? space.name,
    replyTo: user?.email,
    subject: subject.trim().slice(0, 200),
    body: emailBody.trim().slice(0, 10000),
  });

  // Bump lastContactedAt so the contact list ordering and the "X days quiet"
  // line on the detail page both reflect this send immediately — not just the
  // activity row, which not every consumer reads.
  const now = new Date().toISOString();
  const { error: contactUpdateError } = await supabase
    .from('Contact')
    .update({ lastContactedAt: now, updatedAt: now })
    .eq('id', id)
    .eq('spaceId', space.id);
  if (contactUpdateError) console.error('[email/route] failed to update lastContactedAt', contactUpdateError);

  // Log as ContactActivity — non-blocking; email already sent
  const { error: activityError } = await supabase.from('ContactActivity').insert({
    id: crypto.randomUUID(),
    contactId: id,
    spaceId: space.id,
    type: 'email',
    content: subject.trim().slice(0, 200),
    metadata: { body: emailBody.trim().slice(0, 2000), to: contact.email },
  });
  if (activityError) console.error('[email/route] failed to log ContactActivity', activityError);

  return NextResponse.json({ success: true });
}
