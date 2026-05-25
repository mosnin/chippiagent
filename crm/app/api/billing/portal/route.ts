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
    .select('stripeCustomerId')
    .eq('id', space.id)
    .single();

  if (!stripeData?.stripeCustomerId) {
    return NextResponse.json({ error: 'No billing account found. Please subscribe first.' }, { status: 400 });
  }

  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.usechippi.com';

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeData.stripeCustomerId,
    return_url: `${appUrl}/s/${slug}/billing`,
  });

  return NextResponse.json({ url: session.url });
}
