'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth, useClerk } from '@clerk/nextjs';
import { Loader2 } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { OnboardingBrandMark } from '@/components/onboarding/onboarding-brand-mark';
import { BODY_MUTED, GHOST_PILL, PRIMARY_PILL, TITLE_FONT } from '@/lib/typography';
import { cn } from '@/lib/utils';

function BillingRequiredContent() {
  const { isSignedIn, isLoaded } = useAuth();
  const { signOut } = useClerk();
  const searchParams = useSearchParams();
  const [slug, setSlug] = useState(searchParams.get('slug') ?? '');
  const reason = searchParams.get('reason') ?? 'past_due';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (slug || !isLoaded || !isSignedIn) return;
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { if (d.slug) setSlug(d.slug); })
      .catch(() => {});
  }, [slug, isLoaded, isSignedIn]);

  // Redirect unauthenticated users
  if (isLoaded && !isSignedIn) {
    window.location.href = '/login/realtor';
    return null;
  }

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isCanceled = reason === 'canceled';
  const isInactive = reason === 'inactive';
  const needsResubscribe = isCanceled || isInactive;

  // Headline: a calm fact. Body voice: forward-looking, in Chippi's tone.
  const title = needsResubscribe
    ? 'Your access ended.'
    : 'Payment didn’t go through.';
  const subhead = needsResubscribe
    ? 'Subscribe to keep your pipeline moving.'
    : 'Update your card to keep your pipeline moving.';

  async function handleManageBilling() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Could not open billing portal.');
        setLoading(false);
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  async function handleResubscribe() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Could not start checkout.');
        setLoading(false);
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  const primaryLabel = needsResubscribe ? 'Subscribe' : 'Update payment method';
  const primaryAction = needsResubscribe ? handleResubscribe : handleManageBilling;

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Brand-warm wash — same as onboarding-shell, so trial-end feels like
          another staged moment in the same flow. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-orange-50/40 via-background to-orange-50/30 dark:from-orange-500/[0.04] dark:via-background dark:to-orange-500/[0.03]"
      />

      {/* Logo, top-left */}
      <div className="absolute left-6 top-6 z-20">
        <BrandLogo className="h-7" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-20">
        <OnboardingBrandMark />

        <div className="mt-7 flex w-full max-w-xl flex-col items-center text-center">
          {/* Title — serif Times, calm fact */}
          <h1
            className="text-4xl tracking-tight text-foreground"
            style={TITLE_FONT}
          >
            {title}
          </h1>

          {/* One-line subhead in brand voice */}
          <p className={cn(BODY_MUTED, 'mt-3 text-base')}>{subhead}</p>

          {/* Brand promise — same two-line treatment as auth right panel.
              Reinforces the brand at the moment they're choosing to pay. */}
          <div className="mt-10">
            <p style={TITLE_FONT} className="text-2xl tracking-tight text-foreground">
              I keep your day moving
            </p>
            <p style={TITLE_FONT} className="text-xl tracking-tight text-muted-foreground">
              so you don&apos;t have to.
            </p>
          </div>

          {/* Error — quiet, not a colored panel */}
          {error && (
            <p className="mt-6 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {/* Primary action — single pill */}
          <div className="mt-10 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={primaryAction}
              disabled={loading || !slug}
              className={cn(
                PRIMARY_PILL,
                'h-10 px-6',
                'disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : null}
              {loading ? 'Redirecting…' : primaryLabel}
            </button>

            {/* Quiet secondary — sign out */}
            <button
              type="button"
              onClick={() => signOut({ redirectUrl: '/login/realtor' })}
              className={GHOST_PILL}
            >
              Sign out
            </button>
          </div>

          {/* Help — tiny caption, no urgency */}
          <p className="mt-12 text-xs text-muted-foreground">
            Need help?{' '}
            <a
              href="mailto:support@usechippi.com"
              className="underline underline-offset-4 hover:text-foreground transition-colors"
            >
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function BillingRequiredPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <BillingRequiredContent />
    </Suspense>
  );
}
