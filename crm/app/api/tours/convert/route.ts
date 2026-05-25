import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';

/**
 * Convert a completed tour into a deal.
 * Pre-fills the deal with guest info and property address,
 * links the contact, and records the sourceTourId.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, tourId } = body;

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!tourId) return NextResponse.json({ error: 'tourId required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Fetch the tour
  const { data: tour, error: tourError } = await supabase
    .from('Tour')
    .select('*')
    .eq('id', tourId)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (tourError) throw tourError;
  if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });

  // Check if already converted
  const { data: existingDeal } = await supabase
    .from('Deal')
    .select('id')
    .eq('sourceTourId', tourId)
    .maybeSingle();
  if (existingDeal) {
    return NextResponse.json({ error: 'Tour already converted to a deal', dealId: existingDeal.id }, { status: 409 });
  }

  // Get the first deal stage for this space (used as default)
  const { data: firstStage } = await supabase
    .from('DealStage')
    .select('id')
    .eq('spaceId', space.id)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstStage) {
    return NextResponse.json({ error: 'No deal stages configured. Create a deal stage first.' }, { status: 400 });
  }

  // Create or find linked contact
  let contactId = tour.contactId;
  if (!contactId) {
    // Try to find by email
    const { data: contactRow } = await supabase
      .from('Contact')
      .select('id')
      .eq('spaceId', space.id)
      .ilike('email', tour.guestEmail)
      .maybeSingle();

    if (contactRow) {
      contactId = contactRow.id;
    } else {
      // Create a new contact
      const newContactId = crypto.randomUUID();
      const { error: contactErr } = await supabase.from('Contact').insert({
        id: newContactId,
        spaceId: space.id,
        name: tour.guestName,
        email: tour.guestEmail,
        phone: tour.guestPhone || null,
        type: 'TOUR',
        tags: ['from-tour'],
        scoringStatus: 'unscored',
      });
      if (!contactErr) contactId = newContactId;
    }
  }

  // Determine the next position in the first stage
  const { data: maxPositionRow } = await supabase
    .from('Deal')
    .select('position')
    .eq('stageId', firstStage.id)
    .eq('spaceId', space.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = maxPositionRow ? maxPositionRow.position + 1 : 0;

  // Create the deal
  const dealId = crypto.randomUUID();
  const { data: deal, error: dealError } = await supabase
    .from('Deal')
    .insert({
      id: dealId,
      spaceId: space.id,
      title: tour.propertyAddress
        ? `${tour.guestName} — ${tour.propertyAddress}`
        : `${tour.guestName} — Tour Follow-up`,
      address: tour.propertyAddress || null,
      description: `Converted from tour on ${new Date(tour.startsAt).toLocaleDateString()}${tour.notes ? `\n\nTour notes: ${tour.notes}` : ''}`,
      stageId: firstStage.id,
      status: 'active',
      priority: 'MEDIUM',
      position: nextPosition,
      milestones: [],
      sourceTourId: tourId,
    })
    .select()
    .single();
  if (dealError) throw dealError;

  // Link contact to deal
  if (contactId) {
    const { error: dcError } = await supabase.from('DealContact').insert({ dealId, contactId });
    if (dcError) console.error('[convert] DealContact link failed:', dcError);
    // Update tour with contact link if it wasn't set
    if (!tour.contactId) {
      await supabase.from('Tour').update({ contactId }).eq('id', tourId);
    }
  }

  return NextResponse.json({ deal, contactId }, { status: 201 });
}
