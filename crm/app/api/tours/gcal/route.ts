import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { encrypt, decrypt } from '@/lib/crypto';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? '';

/** GET — return connection status + generate OAuth URL */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const { data: token } = await supabase
    .from('GoogleCalendarToken')
    .select('id, calendarId, createdAt')
    .eq('spaceId', space.id)
    .maybeSingle();

  if (!GOOGLE_CLIENT_ID) {
    return NextResponse.json({ connected: !!token, configured: false, token: token ?? null });
  }

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${GOOGLE_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('https://www.googleapis.com/auth/calendar.events')}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${slug}`;

  return NextResponse.json({ connected: !!token, configured: true, authUrl, token: token ?? null });
}

/** POST — exchange OAuth code for tokens OR sync a specific tour */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, action } = body;

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Handle OAuth callback
  if (action === 'exchange_code') {
    const { code } = body;
    if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error('[gcal] Token exchange failed:', text);
      return NextResponse.json({ error: 'Google auth failed' }, { status: 400 });
    }

    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      return NextResponse.json({ error: 'Invalid token response from Google' }, { status: 400 });
    }

    // Build the upsert payload — only update refreshToken if Google returned one
    // (Google omits refresh_token on re-authorization if one already exists)
    const upsertPayload: Record<string, unknown> = {
      id: crypto.randomUUID(),
      spaceId: space.id,
      accessToken: tokens.access_token,
      expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (tokens.refresh_token) {
      upsertPayload.refreshToken = encrypt(tokens.refresh_token);
    }

    const { error } = await supabase
      .from('GoogleCalendarToken')
      .upsert(upsertPayload, { onConflict: 'spaceId' });
    if (error) throw error;

    return NextResponse.json({ connected: true });
  }

  // Handle syncing a tour to Google Calendar
  if (action === 'sync_tour') {
    const { tourId } = body;
    if (!tourId) return NextResponse.json({ error: 'tourId required' }, { status: 400 });

    const { data: tokenRow } = await supabase
      .from('GoogleCalendarToken')
      .select('*')
      .eq('spaceId', space.id)
      .maybeSingle();
    if (!tokenRow) return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 400 });

    const accessToken = await getValidAccessToken(tokenRow, space.id);

    const { data: tour } = await supabase.from('Tour').select('*').eq('id', tourId).maybeSingle();
    if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });

    const event = {
      summary: `Tour: ${tour.guestName}`,
      description: [
        `Guest: ${tour.guestName}`,
        tour.guestEmail ? `Email: ${tour.guestEmail}` : '',
        tour.guestPhone ? `Phone: ${tour.guestPhone}` : '',
        tour.propertyAddress ? `Property: ${tour.propertyAddress}` : '',
        tour.notes ? `Notes: ${tour.notes}` : '',
      ].filter(Boolean).join('\n'),
      start: { dateTime: tour.startsAt, timeZone: 'UTC' },
      end: { dateTime: tour.endsAt, timeZone: 'UTC' },
    };

    const calendarId = tokenRow.calendarId || 'primary';

    // Update existing event or create new
    let googleEventId = tour.googleEventId;
    if (googleEventId) {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${googleEventId}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        }
      );
      if (!res.ok) {
        // Clear the stale event ID in the DB so it gets re-created on retry
        await supabase.from('Tour').update({ googleEventId: null }).eq('id', tourId);
        googleEventId = null; // Re-create below
      }
    }

    if (!googleEventId) {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        console.error('[gcal] Create event failed:', text);
        return NextResponse.json({ error: 'Failed to create calendar event' }, { status: 500 });
      }
      const created = await res.json();
      googleEventId = created.id;
    }

    await supabase.from('Tour').update({ googleEventId }).eq('id', tourId);

    return NextResponse.json({ synced: true, googleEventId });
  }

  // Disconnect
  if (action === 'disconnect') {
    await supabase.from('GoogleCalendarToken').delete().eq('spaceId', space.id);
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

async function getValidAccessToken(tokenRow: any, spaceId: string): Promise<string> {
  const expiresAt = new Date(tokenRow.expiresAt).getTime();
  if (Date.now() < expiresAt - 60_000) {
    return tokenRow.accessToken;
  }

  // Refresh the token
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
    console.error('[gcal] Token refresh failed:', res.status, errText);
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
