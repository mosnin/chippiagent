import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { redis } from '@/lib/redis';
import { logger } from '@/lib/logger';

/** Send a subscription status email to the space owner (non-blocking). */
async function notifySubscriptionChange(subscriptionId: string, newStatus: string) {
  try {
    const { data: space } = await supabase
      .from('Space')
      .select('id, name, slug, ownerId')
      .eq('stripeSubscriptionId', subscriptionId)
      .maybeSingle();
    if (!space) return;

    const { data: owner } = await supabase
      .from('User')
      .select('email, name')
      .eq('id', space.ownerId)
      .maybeSingle();
    if (!owner?.email) return;

    if (!process.env.RESEND_API_KEY) return;
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const rawFrom = process.env.RESEND_FROM_EMAIL ?? 'notifications@alerts.usechippi.com';
    const FROM = rawFrom.includes('@') ? rawFrom : `notifications@${rawFrom}`;

    const statusMessages: Record<string, { subject: string; body: string }> = {
      active: {
        subject: `Your Chippi subscription is now active`,
        body: `Great news! Your subscription for <strong>${space.name}</strong> is active. You have full access to all features.`,
      },
      past_due: {
        subject: `Payment issue with your Chippi subscription`,
        body: `We had trouble processing your payment for <strong>${space.name}</strong>. Please update your payment method to keep your access.`,
      },
      canceled: {
        subject: `Your Chippi subscription has been canceled`,
        body: `Your subscription for <strong>${space.name}</strong> has been canceled. You can resubscribe anytime from your billing page.`,
      },
      trial_ending: {
        subject: `Your Chippi trial ends in 3 days`,
        body: `Your free trial for <strong>${space.name}</strong> ends in 3 days. Add a payment method to keep your access without interruption.`,
      },
    };

    const msg = statusMessages[newStatus];
    if (!msg) return;

    const domain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'my.usechippi.com';

    const result = await resend.emails.send({
      from: `Chippi <${FROM}>`,
      to: owner.email,
      subject: msg.subject,
      html: `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px 0">
  <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px">Hi ${owner.name || 'there'},</p>
  <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 20px">${msg.body}</p>
  <a href="https://${domain}/s/${space.slug}/billing" style="display:inline-block;background:#ff964f;color:#fff;font-weight:600;font-size:14px;text-decoration:none;padding:10px 24px;border-radius:8px">View billing</a>
  <p style="font-size:12px;color:#9ca3af;margin-top:20px">— The Chippi team</p>
</div>`,
    });
    if (result.error) {
      logger.error('[stripe-webhook] Resend API error', { resendError: result.error });
    }
  } catch (err) {
    logger.error('[stripe-webhook] subscription email failed', undefined, err);
  }
}

// Disable body parsing — Stripe needs the raw body for signature verification
export const runtime = 'nodejs';

/** Get current_period_end from the first subscription item. */
function getPeriodEnd(sub: Stripe.Subscription): string {
  const ts = sub.items.data[0]?.current_period_end ?? sub.start_date;
  return new Date(ts * 1000).toISOString();
}

/**
 * Map a brokerage plan → seat limit.
 * starter = 5, team = 15, enterprise = unlimited (NULL).
 */
function seatLimitForPlan(plan: string | undefined | null): number | null {
  switch (plan) {
    case 'starter':
      return 5;
    case 'team':
      return 15;
    case 'enterprise':
      return null;
    default:
      return null;
  }
}

/**
 * Extract the subscription id from an invoice across multiple Stripe API shapes.
 */
function extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const invoiceAny = invoice as any;
  if (typeof invoiceAny.subscription === 'string') {
    return invoiceAny.subscription;
  }
  if (typeof invoiceAny.subscription === 'object' && invoiceAny.subscription?.id) {
    return invoiceAny.subscription.id;
  }
  const detail = invoice.parent?.subscription_details?.subscription;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object') return (detail as any).id;
  return undefined;
}

/**
 * Stripe delivers `customer` as an id string by default, but an expanded
 * Customer object if the event (or a retrieve) used `expand`. Comparing the
 * raw value to a stored id then fails closed — a paying team's webhook is
 * rejected as "metadata poisoning" and they stay locked out.
 */
function stripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | null {
  if (!customer) return null;
  if (typeof customer === 'string') return customer;
  if (typeof customer === 'object' && typeof customer.id === 'string') return customer.id;
  return null;
}

function assertDbWrite(error: { message: string } | null, context: string): void {
  if (error) {
    throw new Error(`[stripe-webhook] ${context}: ${error.message}`);
  }
}

/**
 * Guard against metadata poisoning. A subscription's `metadata.brokerageId`
 * is untrusted — whoever created the sub could point it at any brokerage.
 * Before we write to a Brokerage row based on a webhook, confirm the
 * subscription's Stripe customer matches the brokerage's stored customer
 * (or that the brokerage has no customer yet, which is the legitimate
 * first-subscribe case).
 *
 * Returns one of:
 *   'ok'       — safe to write (either customers match, or brokerage has none)
 *   'missing'  — brokerage row doesn't exist (orphaned subscription)
 *   'mismatch' — customer IDs don't match; treat as handled but DO NOT write
 *
 * Every handler that writes to Brokerage based on subscription.metadata
 * MUST call this first. Duplicating the logic inline is how the
 * customer.subscription.deleted and invoice.payment_failed paths shipped
 * without the check; centralising it closes that door.
 */
async function verifyBrokerageOwnsSubscription(
  brokerageId: string,
  subscription: Stripe.Subscription,
  customerOverride?: string | null,
): Promise<{ status: 'ok' | 'missing' | 'mismatch'; existing: { id: string; stripeCustomerId: string | null } | null }> {
  const { data: existing } = await supabase
    .from('Brokerage')
    .select('id, stripeCustomerId')
    .eq('id', brokerageId)
    .maybeSingle();

  if (!existing) {
    logger.warn('[stripe-webhook] subscription references missing brokerage — ignoring', {
      brokerageId,
      subscriptionId: subscription.id,
    });
    return { status: 'missing', existing: null };
  }

  const webhookCustomer = customerOverride ?? stripeCustomerId(subscription.customer);

  if (
    existing.stripeCustomerId &&
    webhookCustomer &&
    existing.stripeCustomerId !== webhookCustomer
  ) {
    logger.error(
      '[stripe-webhook] brokerageId metadata mismatch — brokerage belongs to different customer',
      {
        brokerageId,
        brokerageCustomer: existing.stripeCustomerId,
        webhookCustomer,
        subscriptionId: subscription.id,
      },
    );
    return { status: 'mismatch', existing: { id: existing.id, stripeCustomerId: existing.stripeCustomerId } };
  }

  return {
    status: 'ok',
    existing: { id: existing.id, stripeCustomerId: existing.stripeCustomerId ?? null },
  };
}

type SpaceGuardRow = {
  id: string;
  stripeCustomerId: string | null;
  trialUsedAt: string | null;
};

async function verifySpaceOwnsSubscription(
  spaceId: string,
  subscription: Stripe.Subscription,
  customerOverride?: string | null,
): Promise<{ status: 'ok' | 'missing' | 'mismatch'; existing: SpaceGuardRow | null }> {
  const { data: existing } = await supabase
    .from('Space')
    .select('id, stripeCustomerId, trialUsedAt')
    .eq('id', spaceId)
    .maybeSingle();

  if (!existing) {
    logger.warn('[stripe-webhook] subscription references missing space — ignoring', {
      spaceId,
      subscriptionId: subscription.id,
    });
    return { status: 'missing', existing: null };
  }

  const webhookCustomer = customerOverride ?? stripeCustomerId(subscription.customer);

  if (
    existing.stripeCustomerId &&
    webhookCustomer &&
    existing.stripeCustomerId !== webhookCustomer
  ) {
    logger.error(
      '[stripe-webhook] spaceId metadata mismatch — space belongs to different customer',
      {
        spaceId,
        spaceCustomer: existing.stripeCustomerId,
        webhookCustomer,
        subscriptionId: subscription.id,
      },
    );
    return {
      status: 'mismatch',
      existing: {
        id: existing.id,
        stripeCustomerId: existing.stripeCustomerId,
        trialUsedAt: existing.trialUsedAt ?? null,
      },
    };
  }

  return {
    status: 'ok',
    existing: {
      id: existing.id,
      stripeCustomerId: existing.stripeCustomerId ?? null,
      trialUsedAt: existing.trialUsedAt ?? null,
    },
  };
}

async function updateBrokerageFromSubscription(
  brokerageId: string,
  subscription: Stripe.Subscription,
  opts: { customerId?: string | null; includePlanFromMetadata?: boolean } = {},
): Promise<boolean> {
  const guard = await verifyBrokerageOwnsSubscription(
    brokerageId,
    subscription,
    opts.customerId,
  );
  if (guard.status === 'missing') return false;
  if (guard.status === 'mismatch') return true; // treat as handled — do NOT fall through to Space
  // Guard returned 'ok'; existing is populated.
  const existing = guard.existing!;

  const webhookCustomer = opts.customerId ?? stripeCustomerId(subscription.customer);

  const updateData: Record<string, unknown> = {
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: mapStatus(subscription.status),
    stripePeriodEnd: getPeriodEnd(subscription),
  };

  if (webhookCustomer && !existing.stripeCustomerId) {
    updateData.stripeCustomerId = webhookCustomer;
  }

  if (opts.includePlanFromMetadata) {
    const plan = subscription.metadata?.plan;
    if (plan === 'starter' || plan === 'team' || plan === 'enterprise') {
      updateData.plan = plan;
      updateData.seatLimit = seatLimitForPlan(plan);
    }
  }

  const { error } = await supabase
    .from('Brokerage')
    .update(updateData)
    .eq('id', brokerageId);

  assertDbWrite(error, `failed to update Brokerage ${brokerageId}`);
  return true;
}

/**
 * Persist the full entitlement row on Space. The previous Space path wrote
 * only status + period end on `customer.subscription.updated` /
 * `invoice.payment_succeeded`. If `checkout.session.completed` never stored
 * `stripeSubscriptionId`, later revoke events keyed on that id hit 0 rows
 * and a canceled or past-due team kept paid access.
 */
async function updateSpaceFromSubscription(
  spaceId: string,
  subscription: Stripe.Subscription,
  opts: { customerId?: string | null; recordTrial?: boolean } = {},
): Promise<'ok' | 'missing' | 'mismatch'> {
  const guard = await verifySpaceOwnsSubscription(spaceId, subscription, opts.customerId);
  if (guard.status !== 'ok') return guard.status;
  const existing = guard.existing!;

  const webhookCustomer = opts.customerId ?? stripeCustomerId(subscription.customer);
  const updateData: Record<string, unknown> = {
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: mapStatus(subscription.status),
    stripePeriodEnd: getPeriodEnd(subscription),
  };

  if (webhookCustomer && !existing.stripeCustomerId) {
    updateData.stripeCustomerId = webhookCustomer;
  }

  if (opts.recordTrial && subscription.status === 'trialing' && !existing.trialUsedAt) {
    updateData.trialUsedAt = new Date().toISOString();
  }

  const { error } = await supabase
    .from('Space')
    .update(updateData)
    .eq('id', spaceId);

  assertDbWrite(error, `failed to update Space ${spaceId}`);
  return 'ok';
}

async function revokeSpaceBySubscriptionId(
  subscriptionId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('Space')
    .update(payload)
    .eq('stripeSubscriptionId', subscriptionId);
  assertDbWrite(error, `failed to update Space by subscription ${subscriptionId}`);
}

/**
 * Revoke or dunning-mark a Space. Prefer metadata.spaceId (with the
 * customer guard) so we still hit the row when checkout never persisted
 * `stripeSubscriptionId`. On poison, fall through to the subscription id
 * so the attacker's own row still loses access.
 */
async function revokeSpaceFromSubscription(
  subscription: Stripe.Subscription,
  payload: Record<string, unknown>,
): Promise<void> {
  const spaceId = subscription.metadata?.spaceId;
  if (spaceId) {
    const guard = await verifySpaceOwnsSubscription(spaceId, subscription);
    if (guard.status === 'ok') {
      const { error } = await supabase
        .from('Space')
        .update(payload)
        .eq('id', spaceId);
      assertDbWrite(error, `failed to revoke Space ${spaceId}`);
      return;
    }
  }
  await revokeSpaceBySubscriptionId(subscription.id, payload);
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error('[stripe-webhook] Missing STRIPE_WEBHOOK_SECRET');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  // Read raw body for signature verification
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    logger.error('[stripe-webhook] signature verification failed', undefined, err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency check — skip if already processed
  const eventKey = `stripe:event:${event.id}`;
  try {
    const alreadyProcessed = await redis.get(eventKey);
    if (alreadyProcessed) {
      return NextResponse.json({ received: true });
    }
    await redis.set(eventKey, '1', { ex: 86400 }); // Expire after 24h
  } catch {
    // Redis unavailable — proceed anyway (best effort dedup)
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (!session.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string,
        );

        // Brokerage path: metadata.brokerageId may live on the session or the subscription
        const brokerageId =
          session.metadata?.brokerageId ?? subscription.metadata?.brokerageId;
        if (brokerageId) {
          await updateBrokerageFromSubscription(brokerageId, subscription, {
            customerId: stripeCustomerId(session.customer),
            includePlanFromMetadata: true,
          });
          break;
        }

        const spaceId = session.metadata?.spaceId ?? subscription.metadata?.spaceId;
        if (!spaceId) break;

        await updateSpaceFromSubscription(spaceId, subscription, {
          customerId: stripeCustomerId(session.customer),
          recordTrial: true,
        });
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const newStatus = mapStatus(subscription.status);

        // Brokerage path
        const brokerageId = subscription.metadata?.brokerageId;
        if (brokerageId) {
          await updateBrokerageFromSubscription(brokerageId, subscription, {
            includePlanFromMetadata: true,
          });
          break;
        }

        const spaceId = subscription.metadata?.spaceId;
        if (spaceId) {
          const result = await updateSpaceFromSubscription(spaceId, subscription);
          if (result === 'mismatch') break;
        } else {
          const { error } = await supabase
            .from('Space')
            .update({
              stripeSubscriptionId: subscription.id,
              stripeSubscriptionStatus: newStatus,
              stripePeriodEnd: getPeriodEnd(subscription),
            })
            .eq('stripeSubscriptionId', subscription.id);
          assertDbWrite(error, `failed to update Space by subscription ${subscription.id}`);
        }
        // Notify owner of status change
        try { await notifySubscriptionChange(subscription.id, newStatus); } catch (e) { logger.error('[stripe-webhook] subscription notification failed', undefined, e); }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;

        // Brokerage path: mark canceled but preserve subscription id + seatLimit
        // so the owner has audit context and can resubscribe without losing config.
        // The ownership guard is critical here — without it, an attacker who
        // can set metadata.brokerageId on their OWN subscription could cancel
        // a victim brokerage simply by deleting their sub. (Audit-driven fix.)
        const brokerageId = subscription.metadata?.brokerageId;
        if (brokerageId) {
          const guard = await verifyBrokerageOwnsSubscription(brokerageId, subscription);
          if (guard.status !== 'ok') break; // missing or customer mismatch — swallow
          const { error } = await supabase
            .from('Brokerage')
            .update({
              stripeSubscriptionStatus: 'canceled',
              stripePeriodEnd: getPeriodEnd(subscription),
            })
            .eq('id', brokerageId);
          assertDbWrite(error, `failed to mark brokerage canceled ${brokerageId}`);
          break;
        }

        await revokeSpaceFromSubscription(subscription, {
          stripeSubscriptionStatus: 'canceled',
          stripePeriodEnd: getPeriodEnd(subscription),
        });
        try { await notifySubscriptionChange(subscription.id, 'canceled'); } catch (e) { logger.error('[stripe-webhook] canceled notification failed', undefined, e); }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const paidSubId = extractInvoiceSubscriptionId(invoice);
        if (!paidSubId) break;

        // Fetch live subscription to read authoritative status + metadata
        const paidSub = await stripe.subscriptions.retrieve(paidSubId);
        const paidStatus = mapStatus(paidSub.status);

        // Brokerage path
        const brokerageId = paidSub.metadata?.brokerageId;
        if (brokerageId) {
          await updateBrokerageFromSubscription(brokerageId, paidSub, {
            includePlanFromMetadata: true,
          });
          break;
        }

        const spaceId = paidSub.metadata?.spaceId;
        if (spaceId) {
          const result = await updateSpaceFromSubscription(spaceId, paidSub);
          if (result === 'mismatch') {
            await revokeSpaceBySubscriptionId(paidSubId, {
              stripeSubscriptionId: paidSub.id,
              stripeSubscriptionStatus: paidStatus,
              stripePeriodEnd: getPeriodEnd(paidSub),
            });
          }
        } else {
          const { error } = await supabase
            .from('Space')
            .update({
              stripeSubscriptionId: paidSub.id,
              stripeSubscriptionStatus: paidStatus,
              stripePeriodEnd: getPeriodEnd(paidSub),
            })
            .eq('stripeSubscriptionId', paidSubId);
          assertDbWrite(error, `failed to update Space by subscription ${paidSubId}`);
        }

        // Notify only on active transition (payment recovered past_due subscription)
        if (paidStatus === 'active') {
          try { await notifySubscriptionChange(paidSubId, 'active'); } catch (e) { logger.error('[stripe-webhook] payment_succeeded notification failed', undefined, e); }
        }
        break;
      }

      case 'customer.subscription.trial_will_end': {
        const trialSub = event.data.object as Stripe.Subscription;
        // Brokerage subscriptions don't email via the Space-owner notifier;
        // skip notification for brokerage-scoped trials (owners see dashboard state).
        if (trialSub.metadata?.brokerageId) break;
        try { await notifySubscriptionChange(trialSub.id, 'trial_ending'); } catch (e) { logger.error('[stripe-webhook] trial_will_end notification failed', undefined, e); }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = extractInvoiceSubscriptionId(invoice);
        if (!subId) {
          logger.warn('[stripe-webhook] invoice.payment_failed: could not extract subscription ID', {
            invoiceId: invoice.id,
          });
          break;
        }

        // Fetch live subscription to branch on metadata.brokerageId
        const failedSub = await stripe.subscriptions.retrieve(subId);
        const brokerageId = failedSub.metadata?.brokerageId;
        if (brokerageId) {
          // Same metadata-poisoning guard as subscription.deleted.
          const guard = await verifyBrokerageOwnsSubscription(brokerageId, failedSub);
          if (guard.status !== 'ok') break;
          const { error } = await supabase
            .from('Brokerage')
            .update({ stripeSubscriptionStatus: 'past_due' })
            .eq('id', brokerageId);
          assertDbWrite(error, `failed to mark brokerage past_due ${brokerageId}`);
          break;
        }

        await revokeSpaceFromSubscription(failedSub, {
          stripeSubscriptionStatus: 'past_due',
        });
        try { await notifySubscriptionChange(subId, 'past_due'); } catch (e) { logger.error('[stripe-webhook] past_due notification failed', undefined, e); }
        break;
      }

      default:
        // Unhandled event type — acknowledge receipt
        break;
    }
  } catch (err) {
    logger.error('[stripe-webhook] error processing event', { eventType: event.type }, err);
    // Release the idempotency claim so Stripe's retry can still grant or
    // revoke. Claiming before the handler ran meant a 500 locked payers out
    // for 24h and left canceled teams on active.
    try {
      await redis.del(eventKey);
    } catch {
      // best effort — Stripe will retry either way
    }
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/** Map Stripe subscription status to our DB enum. */
function mapStatus(
  status: Stripe.Subscription.Status,
): 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'inactive' {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    case 'unpaid':
    case 'incomplete_expired' as any:
      return 'unpaid';
    case 'incomplete' as any:
      return 'inactive';
    default:
      return 'inactive';
  }
}
