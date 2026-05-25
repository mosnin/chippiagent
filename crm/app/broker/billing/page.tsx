import { redirect, notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { BillingPage } from '@/components/billing/billing-page';
import { getStripe } from '@/lib/stripe';
import type Stripe from 'stripe';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Billing — Broker Dashboard — Chippi' };

export default async function BrokerBillingPage() {
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const ctx = await getBrokerContext();
  if (!ctx) redirect('/setup');

  // Find the user's own space for billing
  const { data: ownSpaceRow } = await supabase
    .from('Space')
    .select('id, slug, name, stripeCustomerId, stripeSubscriptionId, stripeSubscriptionStatus, stripePeriodEnd')
    .eq('ownerId', ctx.dbUserId)
    .maybeSingle();

  // If user has no personal space, find the brokerage owner's space
  let spaceRow = ownSpaceRow;
  if (!spaceRow) {
    const { data: ownerSpace } = await supabase
      .from('Space')
      .select('id, slug, name, stripeCustomerId, stripeSubscriptionId, stripeSubscriptionStatus, stripePeriodEnd')
      .eq('ownerId', ctx.brokerage.ownerId)
      .maybeSingle();
    spaceRow = ownerSpace;
  }

  if (!spaceRow) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Billing</h1>
          <p className="text-muted-foreground">No workspace found for billing</p>
        </div>
      </div>
    );
  }

  // Only the broker_owner can manage billing. Others see a read-only message.
  const isBrokerOwner = ctx.membership.role === 'broker_owner';
  if (!isBrokerOwner) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Billing</h1>
          <p className="text-muted-foreground">
            Billing is managed by the brokerage owner.
          </p>
        </div>
      </div>
    );
  }

  const slug = spaceRow.slug as string;
  let subscriptionStatus: 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive' =
    (spaceRow.stripeSubscriptionStatus as any) ?? 'inactive';
  let currentPeriodEnd: string | undefined;
  let cardLast4: string | undefined;
  let cardBrand: string | undefined;
  let invoices: { id: string; date: string; amount: string; status: 'paid' | 'open' | 'void'; pdf?: string }[] = [];
  let stripeError = false;

  if (spaceRow.stripeSubscriptionId) {
    try {
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(spaceRow.stripeSubscriptionId as string, {
        expand: ['default_payment_method', 'latest_invoice'],
      });

      subscriptionStatus = mapStatus(sub.status);
      const periodEndTs = sub.items.data[0]?.current_period_end ?? sub.start_date;
      currentPeriodEnd = new Date(periodEndTs * 1000).toISOString();

      const pm = sub.default_payment_method as Stripe.PaymentMethod | null;
      if (pm?.card) {
        cardLast4 = pm.card.last4;
        cardBrand = pm.card.brand;
      }

      if (spaceRow.stripeCustomerId) {
        const invoiceList = await stripe.invoices.list({
          customer: spaceRow.stripeCustomerId as string,
          limit: 10,
        });
        invoices = invoiceList.data.map((inv) => ({
          id: inv.id,
          date: new Date((inv.created ?? 0) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          amount: `$${((inv.amount_paid ?? 0) / 100).toFixed(2)}`,
          status: inv.status === 'paid' ? 'paid' as const : inv.status === 'open' ? 'open' as const : 'void' as const,
          pdf: inv.invoice_pdf ?? undefined,
        }));
      }
    } catch (err) {
      console.error('[broker/billing] Stripe fetch failed:', err);
      stripeError = true;
    }
  }

  if (stripeError) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Billing</h1>
          <p className="text-muted-foreground">Manage your subscription and payment details</p>
        </div>
        <div className="rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 p-6 text-center">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            Unable to load billing information
          </p>
          <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-1 max-w-[320px] mx-auto">
            We couldn&apos;t retrieve your subscription details from Stripe. Please try again later or contact support if the issue persists.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Billing</h1>
        <p className="text-muted-foreground">Manage your subscription and payment details</p>
      </div>
      <BillingPage
        slug={slug}
        subscriptionStatus={subscriptionStatus}
        currentPeriodEnd={currentPeriodEnd}
        cardLast4={cardLast4}
        cardBrand={cardBrand}
        invoices={invoices}
      />
    </div>
  );
}

function mapStatus(status: Stripe.Subscription.Status): 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive' {
  switch (status) {
    case 'active': return 'active';
    case 'trialing': return 'trialing';
    case 'past_due': return 'past_due';
    case 'canceled': return 'canceled';
    default: return 'inactive';
  }
}
