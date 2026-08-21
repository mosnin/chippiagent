import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { decrypt } from '@/lib/crypto';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import {
  applyBufferToBusy,
  calendarEventsToBusy,
  parseFreeBusy,
  subtractMatchingIntervals,
  tourOverlapWindow,
  toursToBusy,
  type BusyInterval,
} from '@/lib/calendar/tour-busy';
import { buildAvailabilitySlots, expandOverrides } from '@/lib/calendar/availability-slots';

/** Public endpoint — returns available time slots for the next 14 days. */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  const dateStr = req.nextUrl.searchParams.get('date'); // YYYY-MM-DD
  const propertyId = req.nextUrl.searchParams.get('propertyId');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  // This route runs 2-3 Supabase queries plus a Google Calendar freeBusy
  // round-trip per request. Without a cap, any scanner can burn through
  // GCal quota and Supabase reads. 60/hour per (slug, IP) leaves headroom
  // for legitimate users (a real booking page makes ~5 calls per session).
  const ip = getClientIp(req);
  const { allowed } = await checkRateLimit(`available:${slug}:${ip}`, 60, 3600);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  // Load space settings
  const { data: settings } = await supabase
    .from('SpaceSetting')
    .select('tourDuration, tourStartHour, tourEndHour, tourDaysAvailable, timezone, tourBufferMinutes, tourBlockedDates')
    .eq('spaceId', space.id)
    .maybeSingle();

  // If a property profile is specified, use its settings instead of defaults
  let duration = settings?.tourDuration ?? 30;
  let startHour = settings?.tourStartHour ?? 7;
  let endHour = settings?.tourEndHour ?? 17;
  let daysAvailable: number[] = settings?.tourDaysAvailable ?? [1, 2, 3, 4, 5];
  let bufferMinutes = settings?.tourBufferMinutes ?? 0;
  const timezone = settings?.timezone ?? 'America/New_York';
  const blockedDates: string[] = settings?.tourBlockedDates ?? [];

  if (propertyId) {
    const { data: profile } = await supabase
      .from('TourPropertyProfile')
      .select('*')
      .eq('id', propertyId)
      .eq('spaceId', space.id)
      .eq('isActive', true)
      .maybeSingle();
    if (profile) {
      duration = profile.tourDuration;
      startHour = profile.startHour;
      endHour = profile.endHour;
      daysAvailable = profile.daysAvailable;
      bufferMinutes = profile.bufferMinutes;
    }
  }

  // Determine date range in agent's timezone
  const now = new Date();
  // Parse the date string as UTC midnight to avoid local-timezone shifts
  const startDate = dateStr ? new Date(dateStr + 'T00:00:00Z') : now;
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 14);

  // Interval overlap, space-wide. The realtor is one person — a tour at
  // property A occupies the same body as a tour at property B.
  // `book_tour_atomic` already checks space-wide; this query must match
  // or the booking page offers slots that 409 (or double-book via other paths).
  const overlap = tourOverlapWindow(startDate, endDate, bufferMinutes);
  const { data: existingTours } = await supabase
    .from('Tour')
    .select('startsAt, endsAt')
    .eq('spaceId', space.id)
    .in('status', ['scheduled', 'confirmed'])
    .lt('startsAt', overlap.to)
    .gt('endsAt', overlap.from);

  const bookedSlots = toursToBusy(existingTours ?? [], bufferMinutes);

  const fromDate = overlap.from.slice(0, 10);
  const toDate = overlap.to.slice(0, 10);
  const { data: calendarEvents } = await supabase
    .from('CalendarEvent')
    .select('date, time')
    .eq('spaceId', space.id)
    .gte('date', fromDate)
    .lte('date', toDate);
  const calendarBusy = calendarEventsToBusy(calendarEvents ?? [], bufferMinutes);

  // Fetch Google Calendar busy times if connected. Fail closed: a connected
  // calendar we cannot read would otherwise advertise every GCal meeting
  // as free, and book_tour_atomic does not re-check GCal.
  const gcalWindowStart = new Date(startDate.getTime() - Math.max(0, bufferMinutes) * 60_000);
  const gcalResult = await fetchGoogleCalendarBusy(space.id, gcalWindowStart, endDate);
  if (gcalResult.state === 'unavailable') {
    return NextResponse.json(
      { error: 'Calendar unavailable', slots: [] },
      { status: 503 },
    );
  }

  let gcalBusySlots: BusyInterval[] =
    gcalResult.state === 'ok' ? applyBufferToBusy(gcalResult.busy, bufferMinutes) : [];

  if (gcalBusySlots.length > 0) {
    const { data: leftoverTours } = await supabase
      .from('Tour')
      .select('startsAt, endsAt')
      .eq('spaceId', space.id)
      .in('status', ['cancelled', 'no_show'])
      .not('googleEventId', 'is', null)
      .lt('startsAt', overlap.to)
      .gt('endsAt', overlap.from);
    // Leftover GCal events keep the exact tour times. Subtract those
    // intervals so a cancelled showing does not hide the slot.
    const leftovers = toursToBusy(leftoverTours ?? [], 0);
    gcalBusySlots = subtractMatchingIntervals(gcalBusySlots, leftovers);
  }

  const allBusySlots = [...bookedSlots, ...calendarBusy, ...gcalBusySlots];

  let overridesQuery = supabase
    .from('TourAvailabilityOverride')
    .select('date, isBlocked, startHour, endHour, recurrence, endDate, propertyProfileId')
    .eq('spaceId', space.id);
  const { data: overridesRaw } = await overridesQuery;

  const overrideMap = expandOverrides(
    overridesRaw ?? [],
    startDate,
    endDate,
    propertyId,
  );

  const slots = buildAvailabilitySlots({
    now,
    startDate,
    timezone,
    duration,
    startHour,
    endHour,
    daysAvailable,
    blockedDates,
    overrideMap,
    busy: allBusySlots,
  });

  // Also fetch all active property profiles for this space (so the booking page can show them)
  const { data: profiles } = await supabase
    .from('TourPropertyProfile')
    .select('id, name, address, tourDuration, isActive')
    .eq('spaceId', space.id)
    .eq('isActive', true)
    .order('createdAt', { ascending: true });

  return NextResponse.json({
    slots,
    duration,
    timezone,
    propertyProfileId: propertyId ?? null,
    propertyProfiles: profiles ?? [],
  });
}

// ── Google Calendar helpers ──────────────────────────────────────────────────

type GcalBusyResult =
  | { state: 'skipped' }
  | { state: 'ok'; busy: BusyInterval[] }
  | { state: 'unavailable' };

async function fetchGoogleCalendarBusy(
  spaceId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<GcalBusyResult> {
  const { data: tokenRow } = await supabase
    .from('GoogleCalendarToken')
    .select('*')
    .eq('spaceId', spaceId)
    .maybeSingle();

  if (!tokenRow) return { state: 'skipped' };

  try {
    const accessToken = await getValidGCalToken(tokenRow, spaceId);
    const calendarId = tokenRow.calendarId || 'primary';

    const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: calendarId }],
      }),
    });

    if (!res.ok) {
      console.error('[availability] GCal freeBusy failed:', res.status);
      return { state: 'unavailable' };
    }

    const data = await res.json();
    const parsed = parseFreeBusy(data, calendarId);
    if (!parsed.ok) {
      console.error('[availability] GCal freeBusy returned no usable busy data');
      return { state: 'unavailable' };
    }

    return { state: 'ok', busy: parsed.busy };
  } catch (err) {
    console.error('[availability] GCal busy check error:', err);
    return { state: 'unavailable' };
  }
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';

async function getValidGCalToken(tokenRow: any, spaceId: string): Promise<string> {
  const expiresAt = new Date(tokenRow.expiresAt).getTime();
  if (Date.now() < expiresAt - 60_000) {
    return tokenRow.accessToken;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: decrypt(tokenRow.refreshToken),
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[availability] GCal token refresh failed:', res.status, errText);
    throw new Error('Failed to refresh Google token');
  }
  const tokens = await res.json();
  if (!tokens.access_token) throw new Error('No access_token in Google refresh response');

  await supabase
    .from('GoogleCalendarToken')
    .update({
      accessToken: tokens.access_token,
      expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .eq('spaceId', spaceId);

  return tokens.access_token;
}
