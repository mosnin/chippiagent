import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getBrokerContext } from '@/lib/permissions';
import { BrokerageSetupClient } from './brokerage-setup-client';

export const metadata = { title: 'Brokerage — Chippi' };

/**
 * /brokerage setup page.
 * - If already a broker: redirect to /broker
 * - If not onboarded: redirect to /setup
 * - Otherwise: show create/join options
 */
export default async function BrokeragePage() {
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const { data: user } = await supabase
    .from('User')
    .select('id, onboard')
    .eq('clerkId', userId)
    .maybeSingle();

  if (!user) redirect('/setup');
  if (!user.onboard) redirect('/setup');

  const { data: space } = await supabase
    .from('Space')
    .select('slug')
    .eq('ownerId', user.id)
    .maybeSingle();

  if (!space) redirect('/setup');

  // Already a broker? Go straight to the broker dashboard
  let existingBrokerageName: string | null = null;
  let existingBrokerageId: string | null = null;
  try {
    const ctx = await getBrokerContext();
    if (ctx) {
      existingBrokerageName = ctx.brokerage.name;
      existingBrokerageId = ctx.brokerage.id;
    }
  } catch {
    // non-blocking
  }

  // Already a realtor_member? Also redirect
  if (!existingBrokerageName) {
    const { data: membership } = await supabase
      .from('BrokerageMembership')
      .select('brokerageId')
      .eq('userId', user.id)
      .eq('role', 'realtor_member')
      .maybeSingle();
    if (membership) {
      const { data: brokerage } = await supabase
        .from('Brokerage')
        .select('name')
        .eq('id', membership.brokerageId)
        .maybeSingle();
      existingBrokerageName = brokerage?.name ?? 'Your brokerage';
      existingBrokerageId = membership.brokerageId;
    }
  }

  return (
    <BrokerageSetupClient
      spaceSlug={space.slug}
      existingBrokerageName={existingBrokerageName}
      existingBrokerageId={existingBrokerageId}
    />
  );
}
