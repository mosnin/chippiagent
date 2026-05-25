/**
 * API authentication helpers — replace repeated auth boilerplate in every route.
 *
 * Usage:
 *   const result = await requireSpaceOwner(slug);
 *   if (result instanceof NextResponse) return result;
 *   const { userId, space } = result;
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import type { Space } from '@/lib/types';

/**
 * Returns { userId } or a 401/403 NextResponse.
 *
 * Brokerage offboarding status gate: after Clerk auth succeeds we look up the
 * User row and reject with 403 if `status === 'offboarded'`. Offboarding is a
 * hard-stop initiated by a broker_owner/broker_admin when an agent leaves the
 * brokerage; their book of business has been reassigned and they must lose API
 * access immediately, even though their Clerk session may still be valid. This
 * is the single choke-point for API auth, so enforcing it here blocks every
 * protected route uniformly. Resilience: if the User row is missing (user is
 * mid-onboarding) or the `status` column isn't present yet (the migration
 * adding it lands separately), we fall through as if active — this keeps the
 * check safe to deploy ahead of the migration.
 */
export async function requireAuth(): Promise<{ userId: string } | NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Offboarding hard-stop — see JSDoc above. Wrapped in try/catch so that a
  // missing `status` column (pre-migration) or transient DB issue does not
  // brick auth; we only block on a definitive 'offboarded' signal.
  try {
    const { data: userRow } = await supabase
      .from('User')
      .select('id, status')
      .eq('clerkId', userId)
      .maybeSingle();

    if (userRow && (userRow as { status?: string }).status === 'offboarded') {
      return NextResponse.json(
        { error: 'Your access has been revoked by your brokerage.', code: 'offboarded' },
        { status: 403 },
      );
    }
  } catch {
    // Swallow: treat as active. The migration adding `status` may not have
    // run yet, and we never want this lookup to break authenticated traffic.
  }

  return { userId };
}

/**
 * Checks that a space has an active or trialing subscription.
 * Admins bypass the check. Returns null if OK, or a 403 NextResponse.
 */
export async function requireActiveSubscription(
  space: Space,
  userId?: string,
): Promise<NextResponse | null> {
  const status = space.stripeSubscriptionStatus ?? 'inactive';
  if (status === 'active' || status === 'trialing') return null;

  // Check if user is a platform admin (admins bypass paywall)
  if (userId) {
    const { data: userRow } = await supabase
      .from('User')
      .select('platformRole')
      .eq('clerkId', userId)
      .maybeSingle();
    if (userRow?.platformRole === 'admin') return null;
  }

  return NextResponse.json(
    { error: 'Active subscription required' },
    { status: 403 },
  );
}

/**
 * Verifies the calling user owns the given workspace slug, OR is a
 * broker_owner/broker_admin of the brokerage that manages this space.
 * Returns { userId, space } or a 4xx NextResponse.
 */
export async function requireSpaceOwner(
  slug: string,
): Promise<{ userId: string; space: Space } | NextResponse> {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // Run both space lookups in parallel instead of sequentially
  const [space, userSpace] = await Promise.all([
    getSpaceFromSlug(slug),
    getSpaceForUser(userId),
  ]);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  // Direct owner check
  if (userSpace && space.id === userSpace.id) {
    return { userId, space };
  }

  // Broker owner/admin check — allow managing brokerage members' spaces
  const { data: dbUser } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .maybeSingle();

  if (dbUser) {
    // Check if the space belongs to a brokerage the user is admin/owner of
    const { data: membership } = await supabase
      .from('BrokerageMembership')
      .select('role, brokerageId')
      .eq('userId', dbUser.id)
      .in('role', ['broker_owner', 'broker_admin'])
      .maybeSingle();

    if (membership) {
      // Check if the space's owner is a member of the same brokerage
      const { data: spaceOwnerMembership } = await supabase
        .from('BrokerageMembership')
        .select('id')
        .eq('brokerageId', membership.brokerageId)
        .eq('userId', space.ownerId)
        .maybeSingle();

      if (spaceOwnerMembership) {
        return { userId, space };
      }
    }
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * Same as requireSpaceOwner but also enforces active subscription.
 */
export async function requirePaidSpaceOwner(
  slug: string,
): Promise<{ userId: string; space: Space } | NextResponse> {
  const result = await requireSpaceOwner(slug);
  if (result instanceof NextResponse) return result;
  const { userId, space } = result;

  const subCheck = await requireActiveSubscription(space, userId);
  if (subCheck) return subCheck;

  return { userId, space };
}

/**
 * Verifies the calling user owns the space that a contact belongs to.
 * Returns { userId, space, contactSpaceId } or a 4xx NextResponse.
 */
export async function requireContactAccess(
  contactId: string,
): Promise<{ userId: string; space: Space } | NextResponse> {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: rows, error } = await supabase
    .from('Contact')
    .select('spaceId')
    .eq('id', contactId)
    .eq('spaceId', space.id)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!rows) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return { userId, space };
}
