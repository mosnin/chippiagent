import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { decrypt } from '@/lib/crypto';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

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

  let propertyProfile: any = null;
  if (propertyId) {
    const { data: profile } = await supabase
      .from('TourPropertyProfile')
      .select('*')
      .eq('id', propertyId)
      .eq('spaceId', space.id)
      .eq('isActive', true)
      .maybeSingle();
    if (profile) {
      propertyProfile = profile;
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

  // Fetch existing tours in range (filter by property if specified)
  let toursQuery = supabase
    .from('Tour')
    .select('startsAt, endsAt')
    .eq('spaceId', space.id)
    .in('status', ['scheduled', 'confirmed'])
    .gte('startsAt', startDate.toISOString())
    .lte('startsAt', endDate.toISOString());
  if (propertyId) {
    toursQuery = toursQuery.eq('propertyProfileId', propertyId);
  }
  const { data: existingTours } = await toursQuery;

  const bookedSlots = (existingTours ?? []).map((t: any) => ({
    start: new Date(t.startsAt).getTime() - bufferMinutes * 60_000,
    end: new Date(t.endsAt).getTime() + bufferMinutes * 60_000,
  }));

  // Fetch Google Calendar busy times if connected
  const gcalBusySlots = await fetchGoogleCalendarBusy(space.id, startDate, endDate);
  const allBusySlots = [...bookedSlots, ...gcalBusySlots];

  const blockedSet = new Set(blockedDates);

  // Fetch overrides (single-date and recurring) scoped to this property or global
  let overridesQuery = supabase
    .from('TourAvailabilityOverride')
    .select('date, isBlocked, startHour, endHour, recurrence, endDate, propertyProfileId')
    .eq('spaceId', space.id);
  const { data: overridesRaw } = await overridesQuery;

  // Build effective overrides for each date in range, expanding recurring ones
  const overrideMap = new Map<string, { isBlocked: boolean; startHour: number | null; endHour: number | null }>();

  for (const o of overridesRaw ?? []) {
    // Filter by property: use override if it's global (null) or matches the requested property
    if (propertyId && o.propertyProfileId && o.propertyProfileId !== propertyId) continue;
    if (!propertyId && o.propertyProfileId) continue;

    if (o.recurrence === 'none') {
      overrideMap.set(o.date, { isBlocked: o.isBlocked, startHour: o.startHour, endHour: o.endHour });
    } else {
      // Expand recurring override into individual dates within our 14-day window
      const oStart = new Date(o.date + 'T12:00:00');
      const oEnd = o.endDate ? new Date(o.endDate + 'T12:00:00') : endDate;
      const cur = new Date(oStart);

      while (cur <= oEnd && cur <= endDate) {
        if (cur >= startDate) {
          const key = cur.toISOString().split('T')[0];
          // Don't overwrite a more specific single-date override
          if (!overrideMap.has(key)) {
            overrideMap.set(key, { isBlocked: o.isBlocked, startHour: o.startHour, endHour: o.endHour });
          }
        }
        // Advance cursor based on recurrence type
        if (o.recurrence === 'weekly') {
          cur.setDate(cur.getDate() + 7);
        } else if (o.recurrence === 'biweekly') {
          cur.setDate(cur.getDate() + 14);
        } else if (o.recurrence === 'monthly') {
          cur.setMonth(cur.getMonth() + 1);
        }
      }
    }
  }

  // Generate slots day by day using TIMEZONE-AWARE date math.
  // Hours (startHour/endHour) are in the space's configured timezone,
  // not UTC. We calculate the UTC offset for each day to generate
  // correct ISO timestamps that render properly in any timezone.
  function getTimezoneOffsetMs(date: Date, tz: string): number {
    // Get the UTC time string for this date in the target timezone
    const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = date.toLocaleString('en-US', { timeZone: tz });
    const utcDate = new Date(utcStr);
    const tzDate = new Date(tzStr);
    return tzDate.getTime() - utcDate.getTime();
  }

  const slots: { date: string; times: string[] }[] = [];
  const cursor = new Date(startDate);
  cursor.setHours(12, 0, 0, 0); // Use noon to avoid DST edge cases

  for (let day = 0; day < 14; day++) {
    // Calculate this day's date in the space's timezone
    const tzOffset = getTimezoneOffsetMs(cursor, timezone);
    const localDate = new Date(cursor.getTime() + tzOffset);
    const dayOfWeek = localDate.getDay();
    const dateKey = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;

    const override = overrideMap.get(dateKey);

    let dayAvailable = false;
    let dayStart = startHour;
    let dayEnd = endHour;

    if (override) {
      if (override.isBlocked) {
        dayAvailable = false;
      } else if (override.startHour != null && override.endHour != null) {
        dayAvailable = true;
        dayStart = override.startHour;
        dayEnd = override.endHour;
      }
    } else {
      dayAvailable = daysAvailable.includes(dayOfWeek) && !blockedSet.has(dateKey);
    }

    if (dayAvailable) {
      const daySlots: string[] = [];
      // End window in ms: dayEnd hours past midnight local
      const dayEndMs = new Date(
        localDate.getFullYear(),
        localDate.getMonth(),
        localDate.getDate(),
        dayEnd % 24, dayEnd >= 24 ? 0 : 0, 0, 0
      ).getTime() + (dayEnd >= 24 ? 24 * 60 * 60_000 : 0);

      for (let hour = dayStart; hour < dayEnd; hour++) {
        for (let min = 0; min < 60; min += duration) {
          // Create the slot time in the space's local timezone, then convert to UTC
          // by subtracting the timezone offset
          const localSlotMs = new Date(
            localDate.getFullYear(),
            localDate.getMonth(),
            localDate.getDate(),
            hour, min, 0, 0
          ).getTime();
          // Ensure the slot END fits within the available window
          if (localSlotMs + duration * 60_000 > dayEndMs) continue;

          const utcSlotMs = localSlotMs - tzOffset;
          const slotStart = new Date(utcSlotMs);
          const slotEnd = new Date(utcSlotMs + duration * 60_000);

          if (slotStart.getTime() < now.getTime()) continue;

          const hasConflict = allBusySlots.some(
            (b) => slotStart.getTime() < b.end && slotEnd.getTime() > b.start
          );
          if (!hasConflict) {
            daySlots.push(slotStart.toISOString());
          }
        }
      }
      if (daySlots.length > 0) {
        slots.push({ date: dateKey, times: daySlots });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

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

async function fetchGoogleCalendarBusy(
  spaceId: string,
  timeMin: Date,
  timeMax: Date
): Promise<Array<{ start: number; end: number }>> {
  const { data: tokenRow } = await supabase
    .from('GoogleCalendarToken')
    .select('*')
    .eq('spaceId', spaceId)
    .maybeSingle();

  if (!tokenRow) return [];

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
      return [];
    }

    const data = await res.json();
    const busyPeriods = data.calendars?.[calendarId]?.busy ?? [];

    return busyPeriods.map((b: { start: string; end: string }) => ({
      start: new Date(b.start).getTime(),
      end: new Date(b.end).getTime(),
    }));
  } catch (err) {
    console.error('[availability] GCal busy check error:', err);
    return [];
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
