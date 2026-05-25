import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const status = req.nextUrl.searchParams.get('status');
  const upcoming = req.nextUrl.searchParams.get('upcoming');

  let query = supabase
    .from('Tour')
    .select('*, Contact(id, name, email, phone)')
    .eq('spaceId', space.id);

  if (status) {
    query = query.eq('status', status);
  }

  if (upcoming === 'true') {
    query = query.gte('startsAt', new Date().toISOString()).in('status', ['scheduled', 'confirmed']);
  }

  const { data, error } = await query.order('startsAt', { ascending: true }).limit(100);
  if (error) throw error;

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, guestName, guestEmail, guestPhone, propertyAddress, notes, startsAt, endsAt, contactId } = body;

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!guestName || !guestEmail || !startsAt || !endsAt) {
    return NextResponse.json({ error: 'guestName, guestEmail, startsAt, endsAt required' }, { status: 400 });
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
  }

  // Verify linked contact belongs to this space
  let validContactId: string | null = null;
  if (contactId) {
    const { data: contactRow, error: cErr } = await supabase
      .from('Contact')
      .select('id')
      .eq('id', contactId)
      .eq('spaceId', space.id)
      .maybeSingle();
    if (cErr) throw cErr;
    validContactId = contactRow?.id ?? null;
  }

  // Generate a manage token even for manually-created tours — the guest
  // still gets a /tour/[token] URL in their confirmation, so they can
  // self-cancel without bothering the agent.
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const manageToken = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, '0')).join('');

  // Route through the same atomic RPC the public /book endpoint uses — locks
  // overlapping tours and rejects conflicts. Without this, an agent creating
  // a manual tour on an already-booked slot silently double-books.
  const tourId = crypto.randomUUID();
  const { data: bookedId, error: rpcError } = await supabase.rpc('book_tour_atomic', {
    p_id: tourId,
    p_space_id: space.id,
    p_contact_id: validContactId,
    p_guest_name: guestName.trim(),
    p_guest_email: guestEmail.trim().toLowerCase(),
    p_guest_phone: guestPhone?.trim() || null,
    p_property_address: propertyAddress?.trim() || null,
    p_notes: notes?.trim() || null,
    p_starts_at: start.toISOString(),
    p_ends_at: end.toISOString(),
    p_property_profile_id: null,
    p_manage_token: manageToken,
  });
  if (rpcError) throw rpcError;
  if (!bookedId) {
    return NextResponse.json({ error: 'This time slot conflicts with an existing tour' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('Tour')
    .select('*')
    .eq('id', tourId)
    .single();
  if (error) throw error;

  return NextResponse.json(data, { status: 201 });
}
