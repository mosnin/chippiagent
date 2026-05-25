import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * POST — Submit tour feedback (from guest, token-based).
 * GET  — Get feedback for a tour (agent, authenticated).
 */
export async function POST(req: NextRequest) {
  const { token, rating, comment } = await req.json();

  // Guest feedback must always be submitted via the manage token.
  // Accepting a bare tourId would allow anyone who guesses/enumerates a UUID
  // to spam or overwrite feedback without any guest-side authorization.
  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  // Rate limit by token to prevent spam
  const rlKey = `feedback:${token}`;
  const { allowed } = await checkRateLimit(rlKey, 3, 3600);
  if (!allowed) return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });

  if (!rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Rating must be 1-5' }, { status: 400 });
  }

  // Verify tour access via manage token only
  let tour: any = null;
  const { data } = await supabase
    .from('Tour')
    .select('id, spaceId, status')
    .eq('manageToken', token)
    .maybeSingle();
  tour = data;

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  if (tour.status !== 'completed') {
    return NextResponse.json({ error: 'Feedback only accepted for completed tours' }, { status: 400 });
  }

  // Check for existing feedback
  const { data: existing } = await supabase
    .from('TourFeedback')
    .select('id')
    .eq('tourId', tour.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'Feedback already submitted' }, { status: 409 });
  }

  const { data: feedback, error } = await supabase
    .from('TourFeedback')
    .insert({
      tourId: tour.id,
      spaceId: tour.spaceId,
      rating: Math.round(rating),
      comment: typeof comment === 'string' ? comment.trim().slice(0, 2000) || null : null,
    })
    .select()
    .single();

  if (error) throw error;

  return NextResponse.json(feedback, { status: 201 });
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  const tourId = req.nextUrl.searchParams.get('tourId');

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;

  if (tourId) {
    const { data } = await supabase
      .from('TourFeedback')
      .select('*')
      .eq('tourId', tourId)
      .eq('spaceId', auth.space.id)
      .maybeSingle();
    if (!data) return NextResponse.json(null);
    return NextResponse.json(data);
  }

  // Return all feedback for this space
  const { data } = await supabase
    .from('TourFeedback')
    .select('*')
    .eq('spaceId', auth.space.id)
    .order('createdAt', { ascending: false })
    .limit(100);

  return NextResponse.json(data ?? []);
}
