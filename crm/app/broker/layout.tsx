import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@clerk/nextjs/server';
import { getBrokerMemberContext } from '@/lib/permissions';
import { Sidebar } from '@/components/dashboard/sidebar';
import { MobileNav } from '@/components/dashboard/mobile-nav';
import { Header } from '@/components/dashboard/header';
import { DashboardFooter } from '@/components/dashboard/footer';
import { supabase } from '@/lib/supabase';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Broker Dashboard — Chippi' };

export default async function BrokerLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const ctx = await getBrokerMemberContext();

  // Not a broker — redirect to the setup page
  if (!ctx) {
    redirect('/setup');
  }

  // Look up their realtor workspace (may not exist for broker-only accounts)
  const { data: spaceRow } = await supabase
    .from('Space')
    .select('id, slug, name')
    .eq('ownerId', ctx.dbUserId)
    .maybeSingle();

  // Check if this is a broker-only account (no personal workspace)
  const { data: userRow } = await supabase
    .from('User')
    .select('accountType, platformRole')
    .eq('id', ctx.dbUserId)
    .maybeSingle();

  const isBrokerOnly = userRow?.accountType === 'broker_only';
  const isPlatformAdmin = userRow?.platformRole === 'admin';

  // If they have no space and are NOT broker-only, send to setup
  if (!spaceRow && !isBrokerOnly) {
    redirect('/setup');
  }

  const slug = spaceRow?.slug as string ?? '';
  const spaceName = (spaceRow?.name as string) ?? ctx.brokerage.name;

  // Subscription gate — redirect to standalone pages
  // Only exempt billing/settings paths for users with subscription history;
  // users with NO subscription history should always be redirected to /subscribe.
  const brokerHeaders = await headers();
  const brokerPath = brokerHeaders.get('x-pathname')
    || brokerHeaders.get('x-invoke-path')
    || brokerHeaders.get('x-matched-path')
    || brokerHeaders.get('next-url')
    || '';
  const isBillingOrSettings =
    brokerPath.includes('/billing') ||
    brokerPath.includes('/settings');

  const isOwnerOfBrokerage = ctx.brokerage.ownerId === ctx.dbUserId;

  if (!isPlatformAdmin && isOwnerOfBrokerage) {
    // Only the brokerage OWNER is gated by subscription.
    // Invited admins and members access the broker dashboard for free —
    // billing is the owner's responsibility.
    if (spaceRow) {
      try {
        const { data: subData, error: subError } = await supabase
          .from('Space')
          .select('stripeSubscriptionStatus, stripeSubscriptionId, trialUsedAt')
          .eq('id', spaceRow.id)
          .maybeSingle();

        if (subError) {
          console.error('[broker-layout] Subscription check query failed:', subError);
          redirect(`/subscribe?slug=${slug}`);
        }

        const hasSubscriptionHistory = !!(subData?.stripeSubscriptionId || subData?.trialUsedAt);
        // Only exempt billing/settings for users with subscription history
        const isBrokerExempt = isBillingOrSettings && hasSubscriptionHistory;

        const status = subData?.stripeSubscriptionStatus ?? 'inactive';
        if (status !== 'active' && status !== 'trialing' && !isBrokerExempt) {
          if (hasSubscriptionHistory) {
            redirect(`/billing-required?slug=${slug}&reason=${status}`);
          }
          redirect(`/subscribe?slug=${slug}`);
        }
      } catch (err: any) {
        // Next.js redirect() throws a special error — re-throw it
        if (err?.digest?.startsWith('NEXT_REDIRECT')) throw err;
        console.error('[broker-layout] Subscription gate error:', err);
        redirect(`/subscribe?slug=${slug}`);
      }
    } else if (isBrokerOnly) {
      // Broker-only owner without a personal space — check via owner's space
      try {
        const { data: ownerSpace } = await supabase
          .from('Space')
          .select('slug, stripeSubscriptionStatus, stripeSubscriptionId, trialUsedAt')
          .eq('ownerId', ctx.brokerage.ownerId)
          .maybeSingle();

        if (ownerSpace) {
          const ownerStatus = ownerSpace.stripeSubscriptionStatus ?? 'inactive';
          const ownerSlug = ownerSpace.slug ?? '';
          const ownerHasHistory = !!(ownerSpace.stripeSubscriptionId || ownerSpace.trialUsedAt);
          const isBrokerOnlyExempt = isBillingOrSettings && ownerHasHistory;

          if (ownerStatus !== 'active' && ownerStatus !== 'trialing' && !isBrokerOnlyExempt) {
            if (ownerHasHistory) {
              redirect(`/billing-required?slug=${ownerSlug}&reason=${ownerStatus}`);
            }
            redirect(`/subscribe?slug=${ownerSlug}`);
          }
        }
        // broker_only without personal space — skip subscription gate entirely.
        // These users have no Space to check against; they manage the brokerage
        // without needing a personal subscription.
      } catch (err: any) {
        if (err?.digest?.startsWith('NEXT_REDIRECT')) throw err;
        console.error('[broker-layout] Broker-only owner subscription check error:', err);
        // Don't redirect broker_only users without a space to /subscribe —
        // they have no slug and the subscription wall doesn't apply to them.
      }
    } else {
      // No space and not broker-only — shouldn't be here
      redirect('/setup');
    }
  }

  let unreadLeadCount = 0;
  if (spaceRow) {
    try {
      const { count, error: countError } = await supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .eq('spaceId', spaceRow.id)
        .contains('tags', ['new-lead']);
      if (countError) throw countError;
      unreadLeadCount = count ?? 0;
    } catch {
      unreadLeadCount = 0;
    }
  }

  return (
    <div className="app-theme flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar
        slug={slug}
        spaceName={spaceName}
        unreadLeadCount={unreadLeadCount}
        isBroker={true}
        isBrokerOnly={isBrokerOnly}
        brokerageName={ctx.brokerage.name}
        brokerageRole={ctx.membership.role}
        brokerageMemberships={[{ id: ctx.brokerage.id, name: ctx.brokerage.name, role: ctx.membership.role }]}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header slug={slug} spaceName={spaceName} title={spaceName} isBroker={true} isBrokerOnly={isBrokerOnly} brokerageName={ctx.brokerage.name} />
        <main className="flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-7 pb-24 md:pb-7 bg-background text-foreground">
          <div className="w-full max-w-[1500px] mx-auto">
          {children}
          <DashboardFooter />
          </div>
        </main>
      </div>
      <MobileNav slug={slug} isBroker={true} isBrokerOnly={isBrokerOnly} />
    </div>
  );
}
