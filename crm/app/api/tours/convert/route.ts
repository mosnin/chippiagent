import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { resolveOrCreateTourContact } from '@/lib/tour-contact';

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

  // Create or find linked contact — same escaped-email resolver as /book.
  // Raw ilike here would convert the tour onto the wrong person's deal.
  let contactId = tour.contactId as string | null;
  if (contactId) {
    const { data: linked, error: linkedErr } = await supabase
      .from('Contact')
      .select('id')
      .eq('id', contactId)
      .eq('spaceId', space.id)
      .maybeSingle();
    if (linkedErr) throw linkedErr;
    if (!linked) {
      contactId = null;
    }
  }
  if (!contactId) {
    contactId = await resolveOrCreateTourContact({
      spaceId: space.id,
      name: tour.guestName,
      email: tour.guestEmail,
      phone: tour.guestPhone,
      sourceLabel: 'from-tour',
      tags: ['from-tour'],
    });
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
