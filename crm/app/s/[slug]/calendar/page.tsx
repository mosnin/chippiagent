import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { CalendarView } from './calendar-view';
import { PAGE_RHYTHM } from '@/lib/typography';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Calendar — ${slug}` };
}

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Calendar pulls a wider tour window than the live grid needs so the stat
  // strip above can compute this-week / conversion / no-show across recent
  // history. Status filter widened — past completed/no_show tours feed the
  // metrics, and cancelled tours are filtered client-side.
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [toursResult, contactFollowUpsResult, dealFollowUpsResult] =
    await Promise.all([
      supabase
        .from('Tour')
        .select(
          'id, guestName, guestEmail, propertyAddress, startsAt, endsAt, status, createdAt'
        )
        .eq('spaceId', space.id)
        .gte('startsAt', ninetyDaysAgo.toISOString())
        .order('startsAt'),
      supabase
        .from('Contact')
        .select('id, name, phone, email, followUpAt')
        .eq('spaceId', space.id)
        .not('followUpAt', 'is', null)
        .order('followUpAt'),
      supabase
        .from('Deal')
        .select('id, title, followUpAt')
        .eq('spaceId', space.id)
        .not('followUpAt', 'is', null)
        .order('followUpAt'),
    ]);

  const tours = (toursResult.data ?? []) as {
    id: string;
    guestName: string;
    guestEmail: string | null;
    propertyAddress: string | null;
    startsAt: string;
    endsAt: string;
    status: string;
    createdAt: string | null;
  }[];

  // Stat strip wants the full set; the calendar grid only wants live ones.
  const liveTours = tours.filter(
    (t) => t.status === 'scheduled' || t.status === 'confirmed'
  );

  // Pull deal links so conversion-rate is real, not a guess. Non-blocking —
  // if the join fails (sourceTourId column missing in older spaces), every
  // tour just shows sourceDealId = null and conversion = 0%.
  let dealsByTour = new Map<string, string>();
  if (tours.length > 0) {
    try {
      const tourIds = tours.map((t) => t.id);
      const { data: dealLinks } = await supabase
        .from('Deal')
        .select('id, sourceTourId')
        .in('sourceTourId', tourIds);
      dealsByTour = new Map(
        (dealLinks ?? []).map((d: { id: string; sourceTourId: string }) => [
          d.sourceTourId,
          d.id,
        ])
      );
    } catch {
      // ignore — column may not exist
    }
  }

  const tourStats = tours.map((t) => ({
    startsAt: t.startsAt,
    status: t.status,
    sourceDealId: dealsByTour.get(t.id) ?? null,
    createdAt: t.createdAt ?? undefined,
  }));

  const contactFollowUps = (contactFollowUpsResult.data ?? []) as {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    followUpAt: string;
  }[];

  const dealFollowUps = (dealFollowUpsResult.data ?? []) as {
    id: string;
    title: string;
    followUpAt: string;
  }[];

  // Fetch custom calendar events (table may not exist yet)
  let customEvents: {
    id: string;
    title: string;
    description: string | null;
    date: string;
    time: string | null;
    color: string;
  }[] = [];

  let calendarNotes: {
    id: string;
    date: string;
    note: string;
  }[] = [];

  try {
    const [eventsResult, notesResult] = await Promise.all([
      supabase
        .from('CalendarEvent')
        .select('id, title, description, date, time, color')
        .eq('spaceId', space.id),
      supabase
        .from('CalendarNote')
        .select('id, date, note')
        .eq('spaceId', space.id),
    ]);
    customEvents = (eventsResult.data ?? []) as typeof customEvents;
    calendarNotes = (notesResult.data ?? []) as typeof calendarNotes;
  } catch {
    // Tables may not exist yet — ignore
  }

  return (
    <div className={PAGE_RHYTHM}>
      <CalendarView
        slug={slug}
        tours={liveTours}
        tourStats={tourStats}
        contactFollowUps={contactFollowUps}
        dealFollowUps={dealFollowUps}
        customEvents={customEvents}
        calendarNotes={calendarNotes}
      />
    </div>
  );
}
