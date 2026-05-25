/**
 * Canonical onboarding contract:
 * - `user.onboard` is the SINGLE source of truth for onboarding completion.
 * - `user.onboardingCompletedAt` is an audit timestamp only — never use it
 *   for routing decisions, and never null it out.
 * - Workspace existence is used only for one-way legacy backfill to make
 *   `user.onboard` trustworthy over time.
 * - All guards must call `getOnboardingStatus()` and check `.isOnboarded`.
 */
import { supabase } from '@/lib/supabase';

type OnboardingUser = {
  id?: string;
  onboard?: boolean | null;
  space?: { id?: string; slug?: string } | null;
} | null;

export function getOnboardingStatus(user: OnboardingUser) {
  return {
    hasUser: !!user,
    hasSpace: !!user?.space,
    isOnboarded: !!user?.onboard,
  };
}

/**
 * Legacy-heal path: old accounts may have a workspace but onboard=false.
 * Backfill onboard=true once so every guard can rely on `user.onboard`.
 */
export function shouldBackfillOnboardFromSpace(user: OnboardingUser) {
  const status = getOnboardingStatus(user);
  return status.hasUser && status.hasSpace && !status.isOnboarded;
}

/**
 * Consolidated backfill — the ONLY place backfill writes should happen.
 * Throws on DB failure so callers know the backfill did not persist.
 * Returns true if a backfill was performed, false otherwise.
 *
 * Usage: call this in every guard/page that loads a user, BEFORE reading
 * onboarding status for routing decisions.
 */
export async function ensureOnboardingBackfill(
  user: OnboardingUser
): Promise<boolean> {
  if (!shouldBackfillOnboardFromSpace(user)) return false;

  const { error } = await supabase
    .from('User')
    .update({
      onboard: true,
      onboardingCompletedAt: new Date().toISOString(),
      onboardingCurrentStep: 7,
    })
    .eq('id', user!.id!);

  if (error) throw error;

  // Mutate in-place so the caller's reference is up-to-date
  if (user) {
    (user as Record<string, unknown>).onboard = true;
  }

  return true;
}
