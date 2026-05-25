import { NextRequest, NextResponse } from 'next/server';
import { createClerkClient, auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { shouldBackfillOnboardFromSpace } from '@/lib/onboarding';
import { checkRateLimit } from '@/lib/rate-limit';
import type { User, Space } from '@/lib/types';

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

export async function POST(req: NextRequest) {
  let admin: { userId: string };
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await auth();
  const { allowed } = await checkRateLimit(`admin:${session.userId}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { action } = body;

  const ALLOWED_ACTIONS = ['send_password_reset', 'repair_onboarding', 'update_subscription', 'suspend_user', 'unsuspend_user', 'comp_free_month', 'issue_refund', 'impersonate_user', 'force_password_reset', 'revoke_session', 'revoke_all_sessions', 'send_mfa_prompt'];
  if (!ALLOWED_ACTIONS.includes(action as string)) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  try {
    // ── Send password reset ─────────────────────────────────────────────
    if (action === 'send_password_reset') {
      const { clerkId } = body as { clerkId: string };
      if (!clerkId || typeof clerkId !== 'string') {
        return NextResponse.json({ error: 'clerkId is required' }, { status: 400 });
      }

      // Look up the Clerk user to get their primary email
      const clerkUser = await clerkClient.users.getUser(clerkId);
      const primaryEmail = clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId
      );

      if (!primaryEmail) {
        return NextResponse.json(
          { error: 'User has no primary email address' },
          { status: 400 }
        );
      }

      // Create a password reset through Clerk's magic link flow
      // Clerk doesn't have a direct "send password reset" API endpoint,
      // but we can use the email address to create a sign-in token.
      // The safest approach: just document the Clerk dashboard path.
      // However, we CAN programmatically update the user's password
      // or create a sign-in link. For safety, we'll log the action
      // and direct the admin to use Clerk Dashboard for password resets.

      logAdminAction({
        actor: admin.userId,
        action: 'send_password_reset',
        target: clerkId,
        details: { email: primaryEmail.emailAddress },
      });

      // Note: Clerk v7 doesn't expose a direct "send password reset email" API.
      // The recommended approach is to use the Clerk Dashboard or
      // set a temporary password. We'll log the request and inform the admin.
      return NextResponse.json({
        success: true,
        message: `Password reset requested for ${primaryEmail.emailAddress}. Use the Clerk Dashboard to complete this action, or the user can use the "Forgot password" flow at sign-in.`,
      });
    }

    // ── Repair onboarding state ─────────────────────────────────────────
    if (action === 'repair_onboarding') {
      const { userId } = body as { userId: string };
      if (!userId || typeof userId !== 'string') {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
      }

      const { data: userRow, error: userError } = await supabase
        .from('User')
        .select('*, Space(id, slug)')
        .eq('id', userId)
        .maybeSingle();

      if (userError) throw userError;

      if (!userRow) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const row = userRow as User & { Space: { id: string; slug: string } | null };
      const user = {
        ...row,
        spaceId: row.Space?.id ?? null,
        slug: row.Space?.slug ?? null,
        space: row.Space ? { id: row.Space.id, slug: row.Space.slug } : null,
      };

      let repairAction = 'none';
      let message = 'No repair needed. User state is healthy.';

      if (shouldBackfillOnboardFromSpace(user)) {
        // Has space but onboard=false → backfill
        const { error } = await supabase
          .from('User')
          .update({
            onboard: true,
            onboardingCompletedAt: new Date().toISOString(),
            onboardingCurrentStep: 7,
          })
          .eq('id', user.id);
        if (error) throw error;
        repairAction = 'backfill_onboard';
        message = 'Backfilled onboard=true because workspace exists.';
      } else if (user.onboard && !user.space) {
        // Onboarded but no space → reset to re-onboard
        const { error } = await supabase
          .from('User')
          .update({
            onboard: false,
            onboardingCurrentStep: 1,
          })
          .eq('id', user.id);
        if (error) throw error;
        repairAction = 'reset_onboarding';
        message = 'Reset onboard=false and step=1 because workspace is missing.';
      }

      logAdminAction({
        actor: admin.userId,
        action: 'repair_onboarding',
        target: userId,
        details: { repairAction, userOnboard: user.onboard, hasSpace: !!user.space },
      });

      return NextResponse.json({ success: true, repairAction, message });
    }

    // ── Update subscription status ───────────────────────────────────────
    if (action === 'update_subscription') {
      const { userId, status, periodEnd } = body as {
        userId: string;
        status: string;
        periodEnd?: string;
      };

      if (!userId || typeof userId !== 'string') {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
      }

      const VALID_STATUSES = ['active', 'trialing', 'past_due', 'canceled', 'unpaid', 'inactive'];
      if (!status || !VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
          { status: 400 }
        );
      }

      const { data: spaceData, error: spaceLookupError } = await supabase
        .from('Space')
        .select('id, stripeSubscriptionId')
        .eq('ownerId', userId)
        .maybeSingle();

      if (spaceLookupError) throw spaceLookupError;

      if (!spaceData) {
        return NextResponse.json({ error: 'No space found for this user' }, { status: 404 });
      }

      // ── Sync to Stripe first ────────────────────────────────────────────
      // Supabase mirrors Stripe via webhook. If we only update Supabase,
      // the next webhook event will overwrite our change with Stripe's truth
      // and the user will be charged on the original schedule.
      let stripeUpdated = false;
      let stripeWarning: string | null = null;
      const subId = (spaceData as any).stripeSubscriptionId as string | null;

      if (subId) {
        try {
          const { getStripe } = await import('@/lib/stripe');
          const stripe = getStripe();

          if (status === 'trialing' && periodEnd) {
            await stripe.subscriptions.update(subId, {
              trial_end: Math.floor(new Date(periodEnd).getTime() / 1000),
              proration_behavior: 'none',
            });
            stripeUpdated = true;
          } else if (status === 'active') {
            // End the trial immediately and activate the subscription
            await stripe.subscriptions.update(subId, {
              trial_end: 'now',
              proration_behavior: 'none',
            });
            stripeUpdated = true;
          } else if (status === 'canceled') {
            await stripe.subscriptions.cancel(subId);
            stripeUpdated = true;
          } else {
            stripeWarning = `Status '${status}' cannot be set via API — only database was updated.`;
          }
        } catch (stripeErr: any) {
          console.error('[admin/update_subscription] Stripe update failed', { stripeErr, subId, status });
          stripeWarning = `Stripe update failed: ${stripeErr.message}. Database updated but billing may not reflect this change until manually corrected in Stripe.`;
        }
      } else {
        stripeWarning = 'No Stripe subscription on record — database updated only. Stripe has no record of this change.';
      }

      // Always mirror to Supabase as our local cache
      const updatePayload: Record<string, unknown> = { stripeSubscriptionStatus: status };
      if (periodEnd) updatePayload.stripePeriodEnd = periodEnd;

      const { error: updateError } = await supabase
        .from('Space')
        .update(updatePayload)
        .eq('id', spaceData.id);

      if (updateError) throw updateError;

      logAdminAction({
        actor: admin.userId,
        action: 'update_subscription',
        target: userId,
        details: { status, periodEnd: periodEnd ?? null, spaceId: spaceData.id, stripeUpdated, stripeWarning },
      });

      const message = stripeWarning
        ? `Database updated. ⚠️ ${stripeWarning}`
        : `Subscription updated to '${status}'${stripeUpdated ? ' in Stripe and database' : ''}.`;

      return NextResponse.json({ success: true, message, stripeUpdated, stripeWarning: stripeWarning ?? undefined });
    }

    // ── Suspend user ─────────────────────────────────────────────────────
    if (action === 'suspend_user') {
      const { userId } = body as { userId: string };
      if (!userId || typeof userId !== 'string') {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
      }

      // Look up the user to get their Clerk ID
      const { data: userRow, error: userError } = await supabase
        .from('User')
        .select('id, clerkId, email')
        .eq('id', userId)
        .maybeSingle();

      if (userError) throw userError;
      if (!userRow) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const target = userRow as { id: string; clerkId: string; email: string };

      // Ban the user in Clerk — prevents them from signing in
      await clerkClient.users.banUser(target.clerkId);

      // Also mark as banned in the DB so the middleware secondary check works
      // even if Clerk metadata hasn't propagated yet.
      await supabase
        .from('User')
        .update({ platformRole: 'banned' })
        .eq('id', userId);

      logAdminAction({
        actor: admin.userId,
        action: 'suspend_user',
        target: userId,
        details: { clerkId: target.clerkId, email: target.email },
      });

      return NextResponse.json({
        success: true,
        message: `User ${target.email} has been suspended. They will be unable to sign in.`,
      });
    }

    // ── Unsuspend user ──────────────────────────────────────────────────
    if (action === 'unsuspend_user') {
      const { userId } = body as { userId: string };
      if (!userId || typeof userId !== 'string') {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
      }

      // Look up the user to get their Clerk ID
      const { data: userRow, error: userError } = await supabase
        .from('User')
        .select('id, clerkId, email')
        .eq('id', userId)
        .maybeSingle();

      if (userError) throw userError;
      if (!userRow) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const target = userRow as { id: string; clerkId: string; email: string };

      // Unban the user in Clerk — restores their ability to sign in
      await clerkClient.users.unbanUser(target.clerkId);

      // Restore platformRole in DB (back to 'user' — admins wouldn't be banned)
      await supabase
        .from('User')
        .update({ platformRole: 'user' })
        .eq('id', userId);

      logAdminAction({
        actor: admin.userId,
        action: 'unsuspend_user',
        target: userId,
        details: { clerkId: target.clerkId, email: target.email },
      });

      return NextResponse.json({
        success: true,
        message: `User ${target.email} has been unsuspended. They can now sign in again.`,
      });
    }

    // ── Comp free month ─────────────────────────────────────────────────
    if (action === 'comp_free_month') {
      const { userId: targetUserId } = body as { userId: string };
      if (!targetUserId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

      const { data: space } = await supabase
        .from('Space')
        .select('id, stripeSubscriptionStatus, stripeSubscriptionId')
        .eq('ownerId', targetUserId)
        .maybeSingle();

      if (!space) return NextResponse.json({ error: 'No workspace found' }, { status: 404 });

      // Only allow comp on non-active/non-trialing subscriptions
      const allowedStatuses = ['canceled', 'past_due', 'unpaid', 'inactive'];
      if (!allowedStatuses.includes((space as any).stripeSubscriptionStatus ?? '')) {
        return NextResponse.json(
          { error: `Cannot comp a free month on a subscription with status '${(space as any).stripeSubscriptionStatus}'. Only allowed for: ${allowedStatuses.join(', ')}.` },
          { status: 400 },
        );
      }

      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const compSubId = (space as any).stripeSubscriptionId as string | null;
      const compStatus = (space as any).stripeSubscriptionStatus as string;

      let stripeUpdated = false;
      let stripeWarning: string | null = null;

      // For past_due and unpaid subscriptions the Stripe subscription still
      // exists — push the trial_end forward so Stripe won't attempt to collect
      // for 30 days.  For canceled/inactive the subscription is gone in Stripe;
      // we can only update the database as a manual billing override.
      if (compSubId && (compStatus === 'past_due' || compStatus === 'unpaid')) {
        try {
          const { getStripe } = await import('@/lib/stripe');
          const stripe = getStripe();
          await stripe.subscriptions.update(compSubId, {
            trial_end: Math.floor(new Date(periodEnd).getTime() / 1000),
            proration_behavior: 'none',
          });
          stripeUpdated = true;
        } catch (stripeErr: any) {
          console.error('[admin/comp_free_month] Stripe update failed', { stripeErr, compSubId });
          stripeWarning = `Stripe update failed: ${stripeErr.message}. Database updated but Stripe may still attempt to collect payment.`;
        }
      } else {
        stripeWarning = `Subscription is '${compStatus}' — Stripe has no active subscription to update. Database marked active for 30 days as a manual override. If you need to re-activate billing, create a new subscription in the Stripe dashboard.`;
      }

      await supabase.from('Space').update({
        stripeSubscriptionStatus: 'active',
        stripePeriodEnd: periodEnd,
      }).eq('id', space.id);

      logAdminAction({ actor: admin.userId, action: 'comp_free_month', target: targetUserId, details: { periodEnd, stripeUpdated, stripeWarning } });

      const message = stripeWarning
        ? `Database updated. ⚠️ ${stripeWarning}`
        : 'Free month applied in Stripe and database. User will not be charged for 30 days.';

      return NextResponse.json({ success: true, periodEnd, stripeUpdated, message });
    }

    // ── Issue refund ──────────────────────────────────────────────────────
    if (action === 'issue_refund') {
      const { userId: targetUserId } = body as { userId: string };

      if (!targetUserId || typeof targetUserId !== 'string') {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
      }

      // Per-admin refund limit: 3 per day
      const { allowed: refundAllowed } = await checkRateLimit(`refund:${admin.userId}`, 3, 86400);
      if (!refundAllowed) {
        return NextResponse.json({ error: 'Refund limit reached (max 3 per day). Try again tomorrow.' }, { status: 429 });
      }

      const { data: space } = await supabase
        .from('Space')
        .select('id, stripeCustomerId')
        .eq('ownerId', targetUserId)
        .maybeSingle();

      if (!space?.stripeCustomerId) return NextResponse.json({ error: 'No Stripe customer' }, { status: 404 });

      const stripe = (await import('@/lib/stripe')).getStripe();

      // Auto-look up the most recent paid invoice for this customer and
      // refund its payment_intent.  stripe.refunds.create() does not accept
      // an `invoice` parameter — it requires `charge` or `payment_intent`.
      const invoices = await stripe.invoices.list({
        customer: space.stripeCustomerId,
        status: 'paid',
        limit: 1,
      });
      const lastInvoice = invoices.data[0];
      if (!lastInvoice) {
        return NextResponse.json({ error: 'No paid invoice found for this customer.' }, { status: 404 });
      }
      // Stripe 20.x dropped `payment_intent` from the top-level Invoice type,
      // but the API still returns the string ID on paid invoices. Narrow
      // through an interface rather than leaning on `any`.
      const paymentIntentId = (lastInvoice as unknown as { payment_intent?: string | null }).payment_intent ?? null;
      if (!paymentIntentId) {
        return NextResponse.json({ error: 'Latest invoice has no associated payment intent.' }, { status: 400 });
      }

      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
      });
      logAdminAction({ actor: admin.userId, action: 'issue_refund', target: targetUserId, details: { invoiceId: lastInvoice.id, paymentIntent: paymentIntentId, refundId: refund.id, amount: refund.amount } });
      return NextResponse.json({ success: true, refundId: refund.id, amount: refund.amount });
    }

    // ── Impersonate user (create sign-in token) ─────────────────────────
    if (action === 'impersonate_user') {
      const { clerkId } = body as { clerkId: string };
      if (!clerkId || typeof clerkId !== 'string') {
        return NextResponse.json({ error: 'clerkId is required' }, { status: 400 });
      }

      try {
        // Sign-in tokens expire quickly and are single-use; safer than a password reset for impersonation.
        const token = await clerkClient.signInTokens.createSignInToken({
          userId: clerkId,
          expiresInSeconds: 600,
        });

        logAdminAction({
          actor: admin.userId,
          action: 'impersonate_user',
          target: clerkId,
          details: { tokenId: token.id, expiresInSeconds: 600 },
        });

        return NextResponse.json({
          success: true,
          url: token.url,
          token: token.token,
          expiresInSeconds: 600,
          message: 'Sign-in link created. Open in an incognito/private window.',
        });
      } catch (err) {
        console.error('[admin-action] impersonate_user failed', err);
        logAdminAction({
          actor: admin.userId,
          action: 'impersonate_user_failed',
          target: clerkId,
          details: { error: err instanceof Error ? err.message : String(err) },
        });
        return NextResponse.json(
          { error: 'Impersonation unavailable. Use the Clerk Dashboard to generate a sign-in link for this user.' },
          { status: 500 }
        );
      }
    }

    // ── Force password reset on next login ──────────────────────────────
    if (action === 'force_password_reset') {
      const { clerkId } = body as { clerkId: string };
      if (!clerkId || typeof clerkId !== 'string') {
        return NextResponse.json({ error: 'clerkId is required' }, { status: 400 });
      }

      const clerkUser = await clerkClient.users.getUser(clerkId);
      const primaryEmail = clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId
      );

      // Revoke all active sessions so the user is forced to re-authenticate, and
      // set a metadata flag the sign-in flow can read to require a password reset.
      const sessions = await clerkClient.sessions.getSessionList({ userId: clerkId, status: 'active' });
      const sessionList = Array.isArray(sessions) ? sessions : sessions.data;
      await Promise.all(sessionList.map((s) => clerkClient.sessions.revokeSession(s.id).catch(() => null)));

      await clerkClient.users.updateUserMetadata(clerkId, {
        publicMetadata: {
          ...(clerkUser.publicMetadata ?? {}),
          mustResetPassword: true,
          mustResetPasswordAt: new Date().toISOString(),
        },
      });

      logAdminAction({
        actor: admin.userId,
        action: 'force_password_reset',
        target: clerkId,
        details: {
          email: primaryEmail?.emailAddress ?? null,
          sessionsRevoked: sessionList.length,
        },
      });

      return NextResponse.json({
        success: true,
        message: `All ${sessionList.length} active session(s) revoked. User must use "Forgot password" to sign in again.`,
      });
    }

    // ── Revoke a single session ─────────────────────────────────────────
    if (action === 'revoke_session') {
      const { sessionId, clerkId } = body as { sessionId: string; clerkId?: string };
      if (!sessionId || typeof sessionId !== 'string') {
        return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
      }

      await clerkClient.sessions.revokeSession(sessionId);

      logAdminAction({
        actor: admin.userId,
        action: 'revoke_session',
        target: clerkId ?? sessionId,
        details: { sessionId },
      });

      return NextResponse.json({ success: true, message: 'Session revoked.' });
    }

    // ── Revoke all sessions for a user ──────────────────────────────────
    if (action === 'revoke_all_sessions') {
      const { clerkId } = body as { clerkId: string };
      if (!clerkId || typeof clerkId !== 'string') {
        return NextResponse.json({ error: 'clerkId is required' }, { status: 400 });
      }

      const sessions = await clerkClient.sessions.getSessionList({ userId: clerkId, status: 'active' });
      const sessionList = Array.isArray(sessions) ? sessions : sessions.data;
      const results = await Promise.all(
        sessionList.map((s) =>
          clerkClient.sessions.revokeSession(s.id).then(
            () => ({ id: s.id, ok: true }),
            () => ({ id: s.id, ok: false }),
          )
        )
      );
      const revoked = results.filter((r) => r.ok).length;

      logAdminAction({
        actor: admin.userId,
        action: 'revoke_all_sessions',
        target: clerkId,
        details: { total: sessionList.length, revoked },
      });

      return NextResponse.json({
        success: true,
        message: `Revoked ${revoked} of ${sessionList.length} active session(s).`,
      });
    }

    // ── Send MFA enrollment prompt email ────────────────────────────────
    if (action === 'send_mfa_prompt') {
      const { clerkId } = body as { clerkId: string };
      if (!clerkId || typeof clerkId !== 'string') {
        return NextResponse.json({ error: 'clerkId is required' }, { status: 400 });
      }

      const clerkUser = await clerkClient.users.getUser(clerkId);
      const primaryEmail = clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId
      );
      if (!primaryEmail) {
        return NextResponse.json({ error: 'User has no primary email address' }, { status: 400 });
      }

      const displayName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null;
      const { sendMfaEnrollmentPrompt } = await import('@/lib/email');
      await sendMfaEnrollmentPrompt({ toEmail: primaryEmail.emailAddress, userName: displayName });

      logAdminAction({
        actor: admin.userId,
        action: 'send_mfa_prompt',
        target: clerkId,
        details: { email: primaryEmail.emailAddress, twoFactorEnabled: clerkUser.twoFactorEnabled },
      });

      return NextResponse.json({
        success: true,
        message: `MFA enrollment prompt sent to ${primaryEmail.emailAddress}.`,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[admin-action] failed', { action, error: err });
    return NextResponse.json(
      { error: 'Server error. Please try again.' },
      { status: 500 }
    );
  }
}
