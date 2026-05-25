import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug } = body;
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { userId, space } = auth;

  const { allowed } = await checkRateLimit(`billing:${userId}`, 5, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  // Fetch Stripe columns separately (getSpaceFromSlug doesn't include them)
  const { data: stripeData } = await supabase
    .from('Space')
    .select('stripeSubscriptionId')
    .eq('id', space.id)
    .single();

  if (!stripeData?.stripeSubscriptionId) {
    return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
  }

  const stripe = getStripe();

  // Cancel at end of billing period (not immediately)
  await stripe.subscriptions.update(stripeData.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  return NextResponse.json({ ok: true });
}
