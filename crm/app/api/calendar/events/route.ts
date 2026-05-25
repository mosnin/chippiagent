import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { checkRateLimit } from '@/lib/rate-limit';

// GET /api/calendar/events?slug=xxx&month=YYYY-MM — list events for a space/month
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  const month = req.nextUrl.searchParams.get('month');

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  let query = supabase
    .from('CalendarEvent')
    .select('id, title, description, date, time, color, createdAt')
    .eq('spaceId', space.id)
    .order('date', { ascending: true });

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const end = new Date(y, m, 0);
    const endStr = `${y}-${String(m).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    query = query.gte('date', start).lte('date', endStr);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Failed to load events' }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/calendar/events — create a new event
export async function POST(req: NextRequest) {
  const { slug, title, date, time, description, color } = await req.json();
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!title || !date) return NextResponse.json({ error: 'title and date required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Rate limit: 60 events per hour per space
  const { allowed } = await checkRateLimit(`calendar-events:${space.id}`, 60, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many events created. Try again later.' }, { status: 429 });
  }

  const VALID_COLORS = ['gray', 'orange', 'blue', 'purple', 'green', 'red'];
  const safeColor = VALID_COLORS.includes(String(color)) ? String(color) : 'gray';

  const { data, error } = await supabase
    .from('CalendarEvent')
    .insert({
      spaceId: space.id,
      title: String(title).slice(0, 200),
      date: String(date),
      time: time ? String(time).slice(0, 10) : null,
      description: description ? String(description).slice(0, 2000) : null,
      color: safeColor,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// DELETE /api/calendar/events?id=xxx — delete an event
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await supabase
    .from('CalendarEvent')
    .delete()
    .eq('id', id)
    .eq('spaceId', space.id);

  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  return NextResponse.json({ success: true });
}
