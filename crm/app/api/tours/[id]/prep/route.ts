import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

/**
 * GET — Generate AI tour prep notes for a specific tour.
 * Combines the guest's contact info, application data, score, and tour details
 * into a structured briefing card without making an LLM call (fast, free).
 *
 * Returns structured data the client renders as a prep card.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;
  const { id } = await params;

  const { data: tour } = await supabase.from('Tour').select('*').eq('id', id).maybeSingle();
  if (!tour) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const space = await getSpaceForUser(userId);
  if (!space || tour.spaceId !== space.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Fetch space timezone for correct date/time display
  const { data: spaceSettings } = await supabase
    .from('SpaceSetting')
    .select('timezone')
    .eq('spaceId', space.id)
    .maybeSingle();
  const timezone = spaceSettings?.timezone || 'America/New_York';

  // Build the prep card from CRM data
  const prep: {
    guestName: string;
    guestEmail: string;
    guestPhone: string | null;
    propertyAddress: string | null;
    tourDate: string;
    tourTime: string;
    duration: number;
    contactHighlights: string[];
    scoreInfo: { score: number | null; label: string | null; summary: string | null } | null;
    applicationHighlights: string[];
    talkingPoints: string[];
    previousTours: number;
    warnings: string[];
  } = {
    guestName: tour.guestName,
    guestEmail: tour.guestEmail,
    guestPhone: tour.guestPhone,
    propertyAddress: tour.propertyAddress,
    tourDate: new Date(tour.startsAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: timezone }),
    tourTime: new Date(tour.startsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone }),
    duration: Math.round((new Date(tour.endsAt).getTime() - new Date(tour.startsAt).getTime()) / 60000),
    contactHighlights: [],
    scoreInfo: null,
    applicationHighlights: [],
    talkingPoints: [],
    previousTours: 0,
    warnings: [],
  };

  // If linked to a contact, pull their data
  if (tour.contactId) {
    const { data: contact } = await supabase.from('Contact').select('*').eq('id', tour.contactId).maybeSingle();

    if (contact) {
      // Highlights
      if (contact.budget) prep.contactHighlights.push(`Budget: $${Number(contact.budget).toLocaleString()}/mo`);
      if (contact.preferences) prep.contactHighlights.push(`Preferences: ${contact.preferences}`);
      if (contact.address) prep.contactHighlights.push(`Current address: ${contact.address}`);
      if (contact.notes) prep.contactHighlights.push(`Notes: ${contact.notes}`);
      if (contact.tags?.length) prep.contactHighlights.push(`Tags: ${contact.tags.join(', ')}`);

      // Score
      if (contact.leadScore != null) {
        prep.scoreInfo = {
          score: contact.leadScore,
          label: contact.scoreLabel,
          summary: contact.scoreSummary,
        };
      }

      // Application data highlights
      const app = contact.applicationData as Record<string, any> | null;
      if (app) {
        if (app.targetMoveInDate) prep.applicationHighlights.push(`Move-in target: ${app.targetMoveInDate}`);
        if (app.employmentStatus) prep.applicationHighlights.push(`Employment: ${app.employmentStatus}`);
        if (app.monthlyGrossIncome) prep.applicationHighlights.push(`Monthly income: $${Number(app.monthlyGrossIncome).toLocaleString()}`);
        if (app.monthlyRent) prep.applicationHighlights.push(`Current rent: $${Number(app.monthlyRent).toLocaleString()}/mo`);
        if (app.leaseTermPreference) prep.applicationHighlights.push(`Preferred lease: ${app.leaseTermPreference}`);
        if (app.hasPets) prep.applicationHighlights.push(`Has pets: ${app.petDetails || 'Yes'}`);
        if (app.adultsOnApplication || app.childrenOrDependents) {
          prep.applicationHighlights.push(`Household: ${app.adultsOnApplication || 0} adults, ${app.childrenOrDependents || 0} children`);
        }
      }

      // Warnings from score details
      const details = contact.scoreDetails as Record<string, any> | null;
      if (details?.riskFlags?.length) {
        prep.warnings = details.riskFlags.slice(0, 4);
      }
    }

    // Count previous tours
    const { count } = await supabase
      .from('Tour')
      .select('*', { count: 'exact', head: true })
      .eq('contactId', tour.contactId)
      .in('status', ['completed', 'confirmed', 'scheduled'])
      .neq('id', id);
    prep.previousTours = count ?? 0;
  }

  // Generate talking points based on available data
  if (tour.propertyAddress) {
    prep.talkingPoints.push(`Confirm the guest is looking at ${tour.propertyAddress}`);
  }
  if (prep.scoreInfo?.label === 'hot') {
    prep.talkingPoints.push('High interest lead — be ready to discuss next steps and application process');
  } else if (prep.scoreInfo?.label === 'cold') {
    prep.talkingPoints.push('Lower engagement so far — focus on understanding their needs and timeline');
  }
  if (prep.applicationHighlights.some((h) => h.includes('Move-in'))) {
    prep.talkingPoints.push('Ask about their move-in timeline and flexibility');
  }
  if (prep.previousTours > 0) {
    prep.talkingPoints.push(`This guest has ${prep.previousTours} previous tour${prep.previousTours > 1 ? 's' : ''} — ask what they liked/disliked`);
  }
  if (prep.warnings.length > 0) {
    prep.talkingPoints.push('Review risk flags before the meeting — prepare to discuss if relevant');
  }
  if (prep.talkingPoints.length === 0) {
    prep.talkingPoints.push('Introduce yourself and ask about their housing needs');
    prep.talkingPoints.push('Discuss timeline, budget, and must-haves');
  }

  return NextResponse.json(prep);
}
