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
 * Apply a subscription state update to the matching Brokerage row.
 * Caller must have already determined that subscription.metadata.brokerageId is set.
 * Returns true if a brokerage was updated (and thus Space path should be skipped),
 * false if the brokerage row no longer exists (idempotency: orphaned subscription).
 */
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

  const webhookCustomer =
    customerOverride ??
    (typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id ?? null);

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

  const webhookCustomer =
    opts.customerId ??
    (typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id ?? null);

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

  if (error) {
    logger.error('[stripe-webhook] failed to update Brokerage', {
      brokerageId,
      subscriptionId: subscription.id,
      dbError: error.message,
    });
  }

  return true;
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
            customerId: session.customer as string,
            includePlanFromMetadata: true,
          });
          break;
        }

        // ── Existing Space path (unchanged) ──────────────────────────────
        const spaceId = session.metadata?.spaceId;
        if (!spaceId) break;

        const updateData: Record<string, unknown> = {
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: subscription.id,
          stripeSubscriptionStatus: mapStatus(subscription.status),
          stripePeriodEnd: getPeriodEnd(subscription),
        };

        // Track trial usage — only set once, never reset
        if (subscription.status === 'trialing') {
          const { data: existing } = await supabase
            .from('Space')
            .select('trialUsedAt')
            .eq('id', spaceId)
            .maybeSingle();
          if (!existing?.trialUsedAt) {
            updateData.trialUsedAt = new Date().toISOString();
          }
        }

        // Validate spaceId ownership before updating
        const { data: targetSpace } = await supabase
          .from('Space')
          .select('stripeCustomerId')
          .eq('id', spaceId)
          .maybeSingle();

        if (targetSpace && targetSpace.stripeCustomerId && targetSpace.stripeCustomerId !== (session.customer as string)) {
          logger.error('[stripe-webhook] checkout spaceId mismatch — rejecting metadata poisoning attempt', {
            spaceId,
            existingCustomer: targetSpace.stripeCustomerId,
            sessionCustomer: session.customer,
          });
          break;
        }

        await supabase
          .from('Space')
          .update(updateData)
          .eq('id', spaceId);
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

        // ── Existing Space path (unchanged) ──────────────────────────────
        const spaceId = subscription.metadata?.spaceId;
        const updateData = {
          stripeSubscriptionStatus: newStatus,
          stripePeriodEnd: getPeriodEnd(subscription),
        };

        if (spaceId) {
          // Validate spaceId ownership: only update if the space's existing customer matches
          // or if the space has no customer yet (first-time setup)
          const { data: existingSpace } = await supabase
            .from('Space')
            .select('stripeCustomerId')
            .eq('id', spaceId)
            .maybeSingle();

          if (existingSpace && existingSpace.stripeCustomerId && existingSpace.stripeCustomerId !== subscription.customer) {
            logger.error('[stripe-webhook] spaceId metadata mismatch — space belongs to different customer', {
              spaceId,
              spaceCustomer: existingSpace.stripeCustomerId,
              webhookCustomer: subscription.customer,
            });
            break; // Reject update — potential metadata poisoning attack
          }

          await supabase.from('Space').update(updateData).eq('id', spaceId);
        } else {
          await supabase
            .from('Space')
            .update(updateData)
            .eq('stripeSubscriptionId', subscription.id);
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
          if (error) {
            logger.error('[stripe-webhook] failed to mark brokerage canceled', {
              brokerageId,
              subscriptionId: subscription.id,
              dbError: error.message,
            });
          }
          break;
        }

        // ── Existing Space path (unchanged) ──────────────────────────────
        await supabase
          .from('Space')
          .update({
            stripeSubscriptionStatus: 'canceled',
            stripePeriodEnd: getPeriodEnd(subscription),
          })
          .eq('stripeSubscriptionId', subscription.id);
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

        // ── Existing Space path (unchanged) ──────────────────────────────
        await supabase
          .from('Space')
          .update({
            stripeSubscriptionStatus: paidStatus,
            stripePeriodEnd: getPeriodEnd(paidSub),
          })
          .eq('stripeSubscriptionId', paidSubId);

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
          if (error) {
            logger.error('[stripe-webhook] failed to mark brokerage past_due', {
              brokerageId,
              subscriptionId: subId,
              dbError: error.message,
            });
          }
          break;
        }

        // ── Existing Space path (unchanged) ──────────────────────────────
        await supabase
          .from('Space')
          .update({ stripeSubscriptionStatus: 'past_due' })
          .eq('stripeSubscriptionId', subId);
        try { await notifySubscriptionChange(subId, 'past_due'); } catch (e) { logger.error('[stripe-webhook] past_due notification failed', undefined, e); }
        break;
      }

      default:
        // Unhandled event type — acknowledge receipt
        break;
    }
  } catch (err) {
    logger.error('[stripe-webhook] error processing event', { eventType: event.type }, err);
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
