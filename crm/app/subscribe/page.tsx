'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Check, Loader2 } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { BackgroundPlus } from '@/components/ui/background-plus';
import { BorderBeam } from '@/components/ui/border-beam';

function SubscribeContent() {
  const { isSignedIn, isLoaded } = useAuth();
  const searchParams = useSearchParams();
  const [slug, setSlug] = useState(searchParams.get('slug') ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // If no slug in URL, fetch it from the user's space
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

  async function handleStartTrial() {
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
      } else if (data.redirect) {
        // Server says go to billing instead (e.g. existing subscription with issues)
        window.location.href = data.redirect;
      } else {
        setError(data.error || 'Failed to start checkout');
        setLoading(false);
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  const features = [
    'AI-powered lead scoring',
    'Unlimited contacts & deals',
    'Custom intake forms',
    'Tour scheduling & booking',
    'Follow-up reminders',
    'Notes, calendar & analytics',
    'Voice AI assistant (Chip)',
    'MCP integration for Claude',
  ];

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden">
      <BackgroundPlus plusColor="#ff964f" plusSize={60} />
      <div className="relative z-10 w-full max-w-3xl space-y-6">
        {/* Branding */}
        <div className="flex justify-center">
          <BrandLogo className="h-8" />
        </div>

        {/* Split pricing card */}
        <Card className="relative rounded-3xl border border-border shadow-xl overflow-hidden p-0">
          <BorderBeam lightColor="#ff964f" lightWidth={300} duration={8} borderWidth={2} />
          <div className="flex flex-col md:flex-row">
            {/* Left side — Plan & Price */}
            <div className="flex flex-col justify-center gap-6 bg-primary/5 p-8 md:p-10 md:w-5/12">
              <div className="space-y-1">
                <p className="text-sm font-medium uppercase tracking-widest text-primary">
                  Chippi Pro
                </p>
                <div className="flex items-end gap-1">
                  <span className="text-5xl font-bold tracking-tight">$97</span>
                  <span className="text-muted-foreground text-lg mb-1">/mo</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  after 7-day free trial &middot; cancel anytime
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* CTA */}
              <Button
                onClick={handleStartTrial}
                disabled={loading || !slug}
                size="lg"
                className="w-full rounded-full text-base font-semibold"
              >
                {loading ? <Loader2 size={18} className="animate-spin mr-2" /> : null}
                {loading ? 'Redirecting to checkout...' : 'Start 7-day free trial'}
              </Button>

              <p className="text-xs text-muted-foreground">
                No credit card upfront &middot; Cancel anytime
              </p>
            </div>

            {/* Right side — Features */}
            <div className="flex flex-col justify-center gap-6 p-8 md:p-10 md:w-7/12">
              <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Everything you need
              </p>
              <ul className="grid grid-cols-1 gap-3">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Check size={12} className="text-primary" />
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Built for realtors and brokerages of all sizes
              </p>
            </div>
          </div>
        </Card>

        {/* Already subscribed? */}
        <p className="text-center text-xs text-muted-foreground">
          Already subscribed?{' '}
          <a
            href={slug ? `/s/${slug}/billing` : '#'}
            className="text-primary underline hover:text-primary/80"
          >
            Manage billing
          </a>
        </p>
      </div>
    </div>
  );
}

export default function SubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SubscribeContent />
    </Suspense>
  );
}
