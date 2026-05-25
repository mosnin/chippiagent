import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/applications/portal/tour/[tourId]/respond
 *
 * Public endpoint — applicant confirms or declines a tour from the portal.
 * Auth pattern matches /api/applications/portal/message and tour-request:
 * applicationRef + statusPortalToken on the Contact, plus the tour must be
 * linked to that same contact.
 *
 * On success:
 *   - Tour.status flipped to 'confirmed' (action='confirm') or 'cancelled'
 *     (action='decline')
 *   - ApplicationMessage row added so the realtor sees the response in the
 *     existing thread + so the applicant has receipt in their own thread
 *
 * Idempotent: confirming an already-confirmed tour is a no-op success.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ tourId: string }> },
) {
  const { tourId } = await ctx.params;
  if (!tourId || typeof tourId !== 'string' || tourId.length > 64) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  let body: {
    applicationRef?: string;
    token?: string;
    action?: 'confirm' | 'decline';
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { applicationRef, token, action, notes } = body;

  if (!applicationRef || !token || !action) {
    return NextResponse.json(
      { error: 'applicationRef, token, and action are required' },
      { status: 400 },
    );
  }
  if (action !== 'confirm' && action !== 'decline') {
    return NextResponse.json(
      { error: "action must be 'confirm' or 'decline'" },
      { status: 400 },
    );
  }
  if (
    typeof applicationRef !== 'string' || applicationRef.length < 10 || applicationRef.length > 64 ||
    typeof token !== 'string' || token.length < 32 || token.length > 128
  ) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  // Rate limit — applicants don't normally respond to tours dozens of times
  const ip = getClientIp(req);
  const { allowed: ipAllowed } = await checkRateLimit(`portal:tour-respond:ip:${ip}`, 30, 3600);
  if (!ipAllowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  // Verify token + application
  const { data: contact, error: contactError } = await supabase
    .from('Contact')
    .select('id, spaceId, name')
    .eq('applicationRef', applicationRef)
    .eq('statusPortalToken', token)
    .maybeSingle();

  if (contactError) {
    console.error('[portal/tour-respond] Contact lookup error:', contactError);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
  if (!contact) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  // Validate tour belongs to this contact + space (defense in depth)
  const { data: tour, error: tourError } = await supabase
    .from('Tour')
    .select('id, spaceId, contactId, status, startsAt, propertyAddress')
    .eq('id', tourId)
    .maybeSingle();

  if (tourError) {
    console.error('[portal/tour-respond] Tour lookup error:', tourError);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
  if (!tour || tour.contactId !== contact.id || tour.spaceId !== contact.spaceId) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  // Idempotent — confirming already-confirmed is a successful no-op.
  // Cancelling an already-cancelled is the same. Don't post duplicate messages.
  const targetStatus = action === 'confirm' ? 'confirmed' : 'cancelled';
  if (tour.status === targetStatus) {
    return NextResponse.json({ ok: true, tour: { id: tour.id, status: tour.status } });
  }

  // Reject illogical transitions — e.g. don't let an applicant confirm a
  // tour that's already been completed or cancelled by the realtor.
  if (tour.status === 'completed' || tour.status === 'no_show') {
    return NextResponse.json(
      { error: 'This tour is closed and can no longer be changed.' },
      { status: 409 },
    );
  }
  if (tour.status === 'cancelled' && action === 'confirm') {
    return NextResponse.json(
      { error: 'This tour was cancelled. Ask your realtor to reschedule.' },
      { status: 409 },
    );
  }

  // Update tour status
  const { error: updateError } = await supabase
    .from('Tour')
    .update({ status: targetStatus, updatedAt: new Date().toISOString() })
    .eq('id', tourId)
    .eq('spaceId', contact.spaceId);
  if (updateError) {
    console.error('[portal/tour-respond] Tour update error:', updateError);
    return NextResponse.json({ error: 'Failed to update tour' }, { status: 500 });
  }

  // Compose receipt message for the thread.
  const sanitize = (s: string) =>
    s
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/[^\w\s.,!?;:'"@#$%&*()\-/+=\[\]{}~`^\n\r\t]/g, '');
  const safeNotes = sanitize((notes ?? '').trim()).slice(0, 1000);
  const tourTime = new Date(tour.startsAt).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const propLine = tour.propertyAddress ? ` at ${sanitize(tour.propertyAddress).slice(0, 200)}` : '';
  const messageBody =
    action === 'confirm'
      ? `✓ Confirmed tour ${tourTime}${propLine}.${safeNotes ? `\n\n${safeNotes}` : ''}`
      : `✗ Can't make tour ${tourTime}${propLine}.${safeNotes ? `\n\n${safeNotes}` : ''}`;

  await supabase
    .from('ApplicationMessage')
    .insert({
      contactId: contact.id,
      spaceId: contact.spaceId,
      senderType: 'applicant',
      content: messageBody,
    });

  return NextResponse.json({
    ok: true,
    tour: { id: tour.id, status: targetStatus },
  });
}
