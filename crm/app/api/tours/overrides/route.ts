import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';

/** GET — list overrides for the next 90 days */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  const propertyId = req.nextUrl.searchParams.get('propertyId');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  let query = supabase
    .from('TourAvailabilityOverride')
    .select('*')
    .eq('spaceId', space.id)
    .order('date', { ascending: true });

  // Filter by property or show global-only
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (propertyId) {
    if (!UUID_RE.test(propertyId)) {
      return NextResponse.json({ error: 'Invalid propertyId' }, { status: 400 });
    }
    query = query.or(`propertyProfileId.eq.${propertyId},propertyProfileId.is.null`);
  } else {
    query = query.is('propertyProfileId', null);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Filter out past non-recurring overrides
  const today = new Date().toISOString().split('T')[0];
  const filtered = (data ?? []).filter((o: any) => {
    if (o.recurrence !== 'none') {
      // Keep recurring overrides if endDate is in the future or not set
      return !o.endDate || o.endDate >= today;
    }
    return o.date >= today;
  });

  return NextResponse.json(filtered);
}

/** POST — create or update an override */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, date, isBlocked, startHour, endHour, label, recurrence, endDate, propertyProfileId } = body;

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date format (YYYY-MM-DD)' }, { status: 400 });
  }

  const validRecurrences = ['none', 'weekly', 'biweekly', 'monthly'];
  const rec = recurrence && validRecurrences.includes(recurrence) ? recurrence : 'none';

  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return NextResponse.json({ error: 'Invalid endDate format' }, { status: 400 });
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Check for an existing override on this date+property combination and delete it first
  // (handles NULL propertyProfileId case where upsert uniqueness may not work)
  {
    let existingQuery = supabase
      .from('TourAvailabilityOverride')
      .select('id')
      .eq('spaceId', space.id)
      .eq('date', date);
    if (propertyProfileId) {
      existingQuery = existingQuery.eq('propertyProfileId', propertyProfileId);
    } else {
      existingQuery = existingQuery.is('propertyProfileId', null);
    }
    const { data: existingRows } = await existingQuery;
    if (existingRows && existingRows.length > 0) {
      const ids = existingRows.map((r: { id: string }) => r.id);
      await supabase.from('TourAvailabilityOverride').delete().in('id', ids);
    }
  }

  if (!isBlocked) {
    if (startHour == null || endHour == null) {
      return NextResponse.json({ error: 'startHour and endHour required when not blocked' }, { status: 400 });
    }
    if (startHour < 0 || startHour > 23 || endHour < 1 || endHour > 24 || endHour <= startHour) {
      return NextResponse.json({ error: 'Invalid hour range' }, { status: 400 });
    }
  }

  // Validate property profile if provided
  if (propertyProfileId) {
    const { data: profile } = await supabase
      .from('TourPropertyProfile')
      .select('id')
      .eq('id', propertyProfileId)
      .eq('spaceId', space.id)
      .maybeSingle();
    if (!profile) return NextResponse.json({ error: 'Property profile not found' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('TourAvailabilityOverride')
    .insert({
      id: crypto.randomUUID(),
      spaceId: space.id,
      propertyProfileId: propertyProfileId || null,
      date,
      isBlocked: !!isBlocked,
      startHour: isBlocked ? null : startHour,
      endHour: isBlocked ? null : endHour,
      label: label?.trim() || null,
      recurrence: rec,
      endDate: rec !== 'none' ? (endDate || null) : null,
    })
    .select()
    .single();
  if (error) throw error;

  return NextResponse.json(data, { status: 201 });
}
