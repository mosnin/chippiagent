import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * POST — Tour reminder cron endpoint.
 * Call this from a cron job (e.g. Vercel Cron, Railway, etc.) every 15 minutes.
 * Finds tours starting within the next 24h and 1h,
 * and returns the list of tours needing reminders.
 *
 * Protected by a simple CRON_SECRET header check.
 */
export async function POST(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    console.error('[tours/reminders] CRON_SECRET env var is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  // Only accept secret via headers (never query params — those appear in logs)
  const secret = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { data: tours24h } = await supabase
    .from('Tour')
    .select('id, guestName, guestEmail, guestPhone, propertyAddress, startsAt, endsAt, status, spaceId, manageToken, contactId')
    .in('status', ['scheduled', 'confirmed'])
    .gte('startsAt', now.toISOString())
    .lte('startsAt', in24h.toISOString())
    .order('startsAt', { ascending: true })
    .limit(100);

  const reminders: Array<{
    tourId: string;
    guestName: string;
    guestEmail: string;
    guestPhone: string | null;
    propertyAddress: string | null;
    startsAt: string;
    manageToken: string | null;
    spaceId: string;
    type: '1h' | '24h';
    businessName: string;
  }> = [];

  if (tours24h?.length) {
    const spaceIds = [...new Set(tours24h.map((t: any) => t.spaceId))];
    const { data: settings } = await supabase
      .from('SpaceSetting')
      .select('spaceId, businessName')
      .in('spaceId', spaceIds);
    const nameMap = new Map((settings ?? []).map((s: any) => [s.spaceId, s.businessName]));

    const { data: spaces } = await supabase
      .from('Space')
      .select('id, name')
      .in('id', spaceIds);
    const spaceNameMap = new Map((spaces ?? []).map((s: any) => [s.id, s.name]));

    for (const tour of tours24h) {
      const tourStart = new Date(tour.startsAt);
      const type = tourStart <= in1h ? '1h' : '24h';

      reminders.push({
        tourId: tour.id,
        guestName: tour.guestName,
        guestEmail: tour.guestEmail,
        guestPhone: tour.guestPhone,
        propertyAddress: tour.propertyAddress,
        startsAt: tour.startsAt,
        manageToken: tour.manageToken,
        spaceId: tour.spaceId,
        type,
        businessName: nameMap.get(tour.spaceId) || spaceNameMap.get(tour.spaceId) || 'Your Agent',
      });
    }
  }

  return NextResponse.json({
    processed: reminders.length,
    reminders,
    timestamp: now.toISOString(),
  });
}
