import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

async function resolveProfile(userId: string, profileId: string) {
  const { data: row } = await supabase.from('TourPropertyProfile').select('*').eq('id', profileId).maybeSingle();
  if (!row) return null;
  const space = await getSpaceForUser(userId);
  if (!space || row.spaceId !== space.id) return null;
  return { profile: row, space };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;
  const { id } = await params;

  const ctx = await resolveProfile(userId, id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.name !== undefined) update.name = body.name;
  if (body.address !== undefined) update.address = body.address || null;
  if (body.tourDuration !== undefined) update.tourDuration = body.tourDuration;
  if (body.startHour !== undefined) update.startHour = body.startHour;
  if (body.endHour !== undefined) update.endHour = body.endHour;
  if (body.daysAvailable !== undefined) update.daysAvailable = body.daysAvailable;
  if (body.bufferMinutes !== undefined) update.bufferMinutes = body.bufferMinutes;
  if (body.isActive !== undefined) update.isActive = body.isActive;

  const { data, error } = await supabase
    .from('TourPropertyProfile')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;
  const { id } = await params;

  const ctx = await resolveProfile(userId, id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await supabase.from('TourPropertyProfile').delete().eq('id', id);
  if (error) throw error;

  return NextResponse.json({ success: true });
}
