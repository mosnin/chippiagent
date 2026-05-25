import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { BillingPage } from '@/components/billing/billing-page';
import { getStripe } from '@/lib/stripe';
import type Stripe from 'stripe';
import { H1, TITLE_FONT } from '@/lib/typography';

export default async function Billing({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  let subscriptionStatus: 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive' =
    (space.stripeSubscriptionStatus as any) ?? 'inactive';
  let currentPeriodEnd: string | undefined;
  let cardLast4: string | undefined;
  let cardBrand: string | undefined;
  let invoices: { id: string; date: string; amount: string; status: 'paid' | 'open' | 'void'; pdf?: string }[] = [];

  // Fetch live data from Stripe if a subscription exists
  if (space.stripeSubscriptionId) {
    try {
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(space.stripeSubscriptionId, {
        expand: ['default_payment_method', 'latest_invoice'],
      });

      subscriptionStatus = mapStatus(sub.status);
      const periodEndTs = sub.items.data[0]?.current_period_end ?? sub.start_date;
      currentPeriodEnd = new Date(periodEndTs * 1000).toISOString();

      // Payment method
      const pm = sub.default_payment_method as Stripe.PaymentMethod | null;
      if (pm?.card) {
        cardLast4 = pm.card.last4;
        cardBrand = pm.card.brand;
      }

      // Invoices — fetch recent
      if (space.stripeCustomerId) {
        const invoiceList = await stripe.invoices.list({
          customer: space.stripeCustomerId,
          limit: 10,
        });
        invoices = invoiceList.data.map((inv) => ({
          id: inv.id,
          date: new Date((inv.created ?? 0) * 1000).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          amount: `$${((inv.amount_paid ?? 0) / 100).toFixed(2)}`,
          status: inv.status === 'paid' ? 'paid' : inv.status === 'open' ? 'open' : 'void',
          pdf: inv.invoice_pdf ?? undefined,
        }));
      }
    } catch (err) {
      console.error('[billing] Failed to fetch Stripe data', err);
      // Fall back to DB-stored status
    }
  }

  const statusLabel =
    subscriptionStatus === 'active' ? 'Subscription active.' :
    subscriptionStatus === 'trialing' ? 'Trial in progress.' :
    subscriptionStatus === 'past_due' ? 'Payment past due — update your card to keep access.' :
    subscriptionStatus === 'canceled' ? 'Subscription canceled.' :
    'No active subscription.';

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="space-y-1.5">
        <p className="text-sm text-muted-foreground">Billing.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Subscription
        </h1>
        <p className="text-sm text-muted-foreground">{statusLabel}</p>
      </header>
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

function mapStatus(
  status: Stripe.Subscription.Status,
): 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive' {
  switch (status) {
    case 'active': return 'active';
    case 'trialing': return 'trialing';
    case 'past_due': return 'past_due';
    case 'canceled': return 'canceled';
    default: return 'inactive';
  }
}
