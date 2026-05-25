import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const { data, error } = await supabase
    .from('TourPropertyProfile')
    .select('*')
    .eq('spaceId', space.id)
    .order('createdAt', { ascending: true });
  if (error) throw error;

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, name, address, tourDuration, startHour, endHour, daysAvailable, bufferMinutes } = body;

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const { data, error } = await supabase
    .from('TourPropertyProfile')
    .insert({
      id: crypto.randomUUID(),
      spaceId: space.id,
      name: name.trim(),
      address: address?.trim() || null,
      tourDuration: tourDuration ?? 30,
      startHour: startHour ?? 9,
      endHour: endHour ?? 17,
      daysAvailable: daysAvailable ?? [1, 2, 3, 4, 5],
      bufferMinutes: bufferMinutes ?? 0,
    })
    .select()
    .single();
  if (error) throw error;

  return NextResponse.json(data, { status: 201 });
}
