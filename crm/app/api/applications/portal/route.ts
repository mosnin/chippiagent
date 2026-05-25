import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * GET /api/applications/portal?ref={applicationRef}&token={statusPortalToken}
 *
 * Public endpoint — applicant access via token-based auth.
 * Returns application status, status history, messages, and submitted data summary.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ref = searchParams.get('ref');
  const token = searchParams.get('token');

  if (!ref || !token) {
    return NextResponse.json({ error: 'Missing ref or token' }, { status: 400 });
  }

  // Validate token format: reject obviously invalid tokens early to avoid DB lookups
  if (ref.length < 10 || ref.length > 64 || token.length < 32 || token.length > 128) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  // Rate limit by IP to prevent token brute-force attacks
  const ip = getClientIp(req);
  const { allowed } = await checkRateLimit(`portal:get:${ip}`, 20, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  // Validate both applicationRef AND statusPortalToken match (defense in depth)
  const { data: contact, error: contactError } = await supabase
    .from('Contact')
    .select(
      'id, name, applicationStatus, applicationStatusNote, applicationRef, spaceId, createdAt',
    )
    .eq('applicationRef', ref)
    .eq('statusPortalToken', token)
    .maybeSingle();

  if (contactError) {
    console.error('[portal] Contact lookup error:', contactError);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  if (!contact) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  // Fetch status history
  const { data: statusHistory } = await supabase
    .from('ApplicationStatusUpdate')
    .select('id, fromStatus, toStatus, note, createdAt')
    .eq('contactId', contact.id)
    .order('createdAt', { ascending: true });

  // Fetch messages
  const { data: messages } = await supabase
    .from('ApplicationMessage')
    .select('id, senderType, content, readAt, createdAt')
    .eq('contactId', contact.id)
    .order('createdAt', { ascending: true });

  // Fetch tours linked to this contact. Filter to active/recent statuses
  // — applicants don't need to see cancelled tours linger in their portal.
  const { data: tours } = await supabase
    .from('Tour')
    .select('id, startsAt, endsAt, propertyAddress, notes, status')
    .eq('contactId', contact.id)
    .in('status', ['scheduled', 'confirmed', 'completed'])
    .order('startsAt', { ascending: true });

  // Mark unread realtor messages as read
  if (messages?.some((m: { senderType: string; readAt: string | null }) => m.senderType === 'realtor' && !m.readAt)) {
    const unreadIds = messages
      .filter((m: { senderType: string; readAt: string | null }) => m.senderType === 'realtor' && !m.readAt)
      .map((m: { id: string }) => m.id);

    await supabase
      .from('ApplicationMessage')
      .update({ readAt: new Date().toISOString() })
      .in('id', unreadIds);
  }

  // Fetch business name for display
  const { data: settings } = await supabase
    .from('SpaceSetting')
    .select('businessName')
    .eq('spaceId', contact.spaceId)
    .maybeSingle();

  return NextResponse.json({
    contact: {
      name: contact.name,
      status: contact.applicationStatus ?? 'received',
      statusNote: contact.applicationStatusNote,
      applicationRef: contact.applicationRef,
      createdAt: contact.createdAt,
    },
    statusHistory: statusHistory ?? [],
    messages: messages ?? [],
    tours: tours ?? [],
    businessName: settings?.businessName ?? null,
  });
}
