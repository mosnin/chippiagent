import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner, requireAuth } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { getSpaceForUser } from '@/lib/space';

// GET /api/calendar/notes?slug=xxx&month=YYYY-MM — list notes for a space/month
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  const month = req.nextUrl.searchParams.get('month'); // e.g. "2026-04"

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  let query = supabase
    .from('CalendarNote')
    .select('id, date, note, createdAt')
    .eq('spaceId', space.id)
    .order('date', { ascending: true });

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const end = new Date(y, m, 0); // last day of month
    const endStr = `${y}-${String(m).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    query = query.gte('date', start).lte('date', endStr);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Failed to load notes' }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/calendar/notes — create a note for a date
export async function POST(req: NextRequest) {
  const { slug, date, note } = await req.json();
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!date || !note?.trim()) {
    return NextResponse.json({ error: 'date and note required' }, { status: 400 });
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Rate limit: 120 notes per hour per space
  const { allowed } = await checkRateLimit(`calendar-notes:${space.id}`, 120, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many notes created. Try again later.' }, { status: 429 });
  }

  const { data, error } = await supabase
    .from('CalendarNote')
    .insert({
      spaceId: space.id,
      date: String(date),
      note: String(note).slice(0, 5000),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// DELETE /api/calendar/notes?id=xxx — delete a note
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await supabase
    .from('CalendarNote')
    .delete()
    .eq('id', id)
    .eq('spaceId', space.id);

  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  return NextResponse.json({ success: true });
}
