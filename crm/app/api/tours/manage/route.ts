import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST — Guest self-service tour management via manage token.
 * Actions: cancel
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { allowed } = await checkRateLimit(`tour-manage:${ip}`, 10, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { token, action } = await req.json();

  if (!token || !action) {
    return NextResponse.json({ error: 'token and action required' }, { status: 400 });
  }

  const { data: tour } = await supabase
    .from('Tour')
    .select('id, status, startsAt')
    .eq('manageToken', token)
    .maybeSingle();

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  if (action === 'cancel') {
    if (tour.status === 'cancelled') {
      return NextResponse.json({ error: 'Already cancelled' }, { status: 400 });
    }
    if (tour.status === 'completed') {
      return NextResponse.json({ error: 'Cannot cancel a completed tour' }, { status: 400 });
    }
    if (tour.status === 'no_show') {
      return NextResponse.json({ error: 'Cannot cancel a no-show tour' }, { status: 400 });
    }
    // Don't allow cancellation within 1 hour of tour
    const hourBefore = new Date(new Date(tour.startsAt).getTime() - 60 * 60 * 1000);
    if (new Date() > hourBefore) {
      return NextResponse.json(
        { error: 'Cannot cancel within 1 hour of the tour. Please contact the agent directly.' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('Tour')
      .update({ status: 'cancelled', updatedAt: new Date().toISOString() })
      .eq('id', tour.id);

    if (error) throw error;
    return NextResponse.json({ success: true, status: 'cancelled' });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
