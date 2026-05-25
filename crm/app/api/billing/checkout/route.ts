import { NextRequest, NextResponse } from 'next/server';
import { getStripe, getPriceId } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { getBrokerContext } from '@/lib/permissions';
import { checkRateLimit } from '@/lib/rate-limit';

type BrokeragePlan = 'starter' | 'team' | 'enterprise';

/** Map plan → Stripe price env var. */
function getBrokeragePriceEnv(plan: BrokeragePlan): string | undefined {
  switch (plan) {
    case 'starter':
      return process.env.STRIPE_PRICE_STARTER;
    case 'team':
      return process.env.STRIPE_PRICE_TEAM;
    case 'enterprise':
      return process.env.STRIPE_PRICE_ENTERPRISE;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const scope = body?.scope;

    if (scope === 'brokerage') {
      return handleBrokerageCheckout(req, body);
    }

    // ── Existing Space flow (unchanged) ────────────────────────────────────
    const { slug } = body;
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

    const auth = await requireSpaceOwner(slug);
    if (auth instanceof NextResponse) return auth;
    const { userId, space } = auth;

    const { allowed } = await checkRateLimit(`billing:${userId}`, 5, 60);
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    // Fetch Stripe columns separately (getSpaceFromSlug doesn't include them)
    const { data: stripeData, error: stripeQueryErr } = await supabase
      .from('Space')
      .select('stripeCustomerId, stripeSubscriptionId, stripeSubscriptionStatus, stripePeriodEnd, trialUsedAt, ownerId')
      .eq('id', space.id)
      .single();

    if (stripeQueryErr) {
      console.error('[checkout] Stripe column query failed:', stripeQueryErr.message, stripeQueryErr.code);
      return NextResponse.json({ error: 'Failed to check subscription status. Please try again.' }, { status: 500 });
    }

    // Block if user already has an active or trialing subscription
    const currentStatus = stripeData?.stripeSubscriptionStatus;
    if (currentStatus === 'active' || currentStatus === 'trialing') {
      return NextResponse.json({ error: 'You already have an active subscription.' }, { status: 400 });
    }

    // If they have a failed/past_due subscription, direct them to billing portal instead
    if (stripeData?.stripeSubscriptionId && (currentStatus === 'past_due' || currentStatus === 'unpaid')) {
      return NextResponse.json({
        error: 'You have an existing subscription with a payment issue. Please update your payment method in billing settings.',
        redirect: `/s/${slug}/billing`,
      }, { status: 400 });
    }

    let stripe;
    try {
      stripe = getStripe();
    } catch (err: any) {
      console.error('[checkout] Stripe init failed:', err.message);
      return NextResponse.json({ error: 'Stripe not configured. Contact support.' }, { status: 500 });
    }

    let priceId;
    try {
      priceId = getPriceId();
    } catch (err: any) {
      console.error('[checkout] Price ID missing:', err.message);
      return NextResponse.json({ error: 'Billing not configured. Contact support.' }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.usechippi.com';

    // Reuse existing Stripe customer or create one
    let customerId = stripeData?.stripeCustomerId;
    if (!customerId) {
      const { data: user } = await supabase
        .from('User')
        .select('email, name')
        .eq('id', space.ownerId)
        .single();

      console.log('[checkout] Creating Stripe customer for space:', space.id);
      const customer = await stripe.customers.create({
        email: user?.email,
        name: user?.name || undefined,
        metadata: { spaceId: space.id, slug: space.slug },
      });
      customerId = customer.id;

      // Conditional write: only persist if another request hasn't already set a customer ID.
      // If this update affects 0 rows (stripeCustomerId was already set by a concurrent request),
      // fetch the winner's customer ID and use that instead — abandoning the duplicate we just created.
      const { data: updateResult } = await supabase
        .from('Space')
        .update({ stripeCustomerId: customerId })
        .eq('id', space.id)
        .is('stripeCustomerId', null)
        .select('stripeCustomerId')
        .single();

      if (!updateResult) {
        // Another concurrent request already set a customer ID — fetch and use theirs
        const { data: winner } = await supabase
          .from('Space')
          .select('stripeCustomerId')
          .eq('id', space.id)
          .single();
        if (winner?.stripeCustomerId) {
          customerId = winner.stripeCustomerId;
        }
      }
    }

    // Only grant a 7-day trial if the user has never used one before
    const hasUsedTrial = !!stripeData?.trialUsedAt;
    const subscriptionData: Record<string, unknown> = {
      metadata: { spaceId: space.id },
    };
    if (!hasUsedTrial) {
      subscriptionData.trial_period_days = 7;
    }

    console.log('[checkout] Creating checkout session, customer:', customerId, 'price:', priceId, 'trial:', !hasUsedTrial);
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: subscriptionData,
      success_url: `${appUrl}/s/${slug}/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/subscribe?slug=${slug}`,
      metadata: { spaceId: space.id },
    });

    console.log('[checkout] Session created:', session.id, 'url:', session.url?.slice(0, 50));
    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('[checkout] FAILED:', err.message, err.stack?.slice(0, 200));
    return NextResponse.json({ error: 'Checkout failed. Please try again.' }, { status: 500 });
  }
}

/**
 * Brokerage-scoped checkout: creates/uses a Stripe customer + subscription
 * attached to the Brokerage row (NOT the broker_owner's personal Space).
 */
async function handleBrokerageCheckout(
  _req: NextRequest,
  body: { plan?: string; scope?: string },
): Promise<NextResponse> {
  // Auth: must be a broker (owner or admin), then enforce broker_owner only
  const ctx = await getBrokerContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (ctx.membership.role !== 'broker_owner') {
    return NextResponse.json(
      { error: 'Only the brokerage owner can manage billing.' },
      { status: 403 },
    );
  }

  // Rate limit per authenticated DB user
  const { allowed } = await checkRateLimit(`billing:brokerage:${ctx.dbUserId}`, 5, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  // Validate plan input
  const plan = body?.plan as BrokeragePlan | undefined;
  if (plan !== 'starter' && plan !== 'team' && plan !== 'enterprise') {
    return NextResponse.json(
      { error: 'plan must be one of: starter, team, enterprise' },
      { status: 400 },
    );
  }

  const priceId = getBrokeragePriceEnv(plan);
  if (!priceId) {
    console.error('[checkout:brokerage] Plan not configured:', plan);
    return NextResponse.json({ error: 'Plan not configured' }, { status: 503 });
  }

  // Load live Stripe columns for the Brokerage row (may not be on ctx.brokerage type yet)
  const { data: brokerageStripe, error: brokerageQueryErr } = await supabase
    .from('Brokerage')
    .select('id, name, ownerId, stripeCustomerId, stripeSubscriptionId, stripeSubscriptionStatus')
    .eq('id', ctx.brokerage.id)
    .single();

  if (brokerageQueryErr || !brokerageStripe) {
    console.error(
      '[checkout:brokerage] Brokerage query failed:',
      brokerageQueryErr?.message,
      brokerageQueryErr?.code,
    );
    return NextResponse.json(
      { error: 'Failed to load brokerage. Please try again.' },
      { status: 500 },
    );
  }

  // Block if the brokerage already has an active or trialing subscription
  const currentStatus = brokerageStripe.stripeSubscriptionStatus;
  if (currentStatus === 'active' || currentStatus === 'trialing') {
    return NextResponse.json(
      { error: 'Your brokerage already has an active subscription.' },
      { status: 400 },
    );
  }
  if (
    brokerageStripe.stripeSubscriptionId &&
    (currentStatus === 'past_due' || currentStatus === 'unpaid')
  ) {
    return NextResponse.json(
      {
        error:
          'Your brokerage has an existing subscription with a payment issue. Please update your payment method in billing settings.',
        redirect: `/broker/billing`,
      },
      { status: 400 },
    );
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch (err: any) {
    console.error('[checkout:brokerage] Stripe init failed:', err.message);
    return NextResponse.json({ error: 'Stripe not configured. Contact support.' }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.usechippi.com';

  // Reuse existing Stripe customer or create one (concurrency-safe)
  let customerId = brokerageStripe.stripeCustomerId ?? null;
  if (!customerId) {
    const { data: owner } = await supabase
      .from('User')
      .select('email, name')
      .eq('id', brokerageStripe.ownerId)
      .single();

    console.log('[checkout:brokerage] Creating Stripe customer for brokerage:', ctx.brokerage.id);
    const customer = await stripe.customers.create({
      email: owner?.email,
      name: owner?.name || brokerageStripe.name || undefined,
      metadata: { brokerageId: ctx.brokerage.id },
    });
    customerId = customer.id;

    // Conditional write: only persist if not already set by a concurrent request.
    const { data: updateResult } = await supabase
      .from('Brokerage')
      .update({ stripeCustomerId: customerId })
      .eq('id', ctx.brokerage.id)
      .is('stripeCustomerId', null)
      .select('stripeCustomerId')
      .single();

    if (!updateResult) {
      const { data: winner } = await supabase
        .from('Brokerage')
        .select('stripeCustomerId')
        .eq('id', ctx.brokerage.id)
        .single();
      if (winner?.stripeCustomerId) {
        customerId = winner.stripeCustomerId;
      }
    }
  }

  try {
    console.log(
      '[checkout:brokerage] Creating checkout session, customer:',
      customerId,
      'price:',
      priceId,
      'plan:',
      plan,
    );
    const session = await stripe.checkout.sessions.create({
      customer: customerId as string,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { brokerageId: ctx.brokerage.id, plan },
      },
      success_url: `${appUrl}/broker/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/broker/billing?canceled=1`,
      metadata: { brokerageId: ctx.brokerage.id, plan },
    });

    console.log(
      '[checkout:brokerage] Session created:',
      session.id,
      'url:',
      session.url?.slice(0, 50),
    );
    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error(
      '[checkout:brokerage] session create failed:',
      err?.message,
      err?.stack?.slice(0, 200),
    );
    return NextResponse.json({ error: 'Checkout failed. Please try again.' }, { status: 500 });
  }
}
