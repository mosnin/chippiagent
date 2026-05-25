'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeSlug, isValidSlug } from '@/lib/intake';
import { rootDomain } from '@/lib/utils';

interface Props {
  defaultName: string;
}

type SlugState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'taken' }
  | { kind: 'invalid'; message: string };

/**
 * Quick-path onboarding — one screen, two real fields. Replaces the old
 * 9-step realtor onboarding. The activation event (intake link) lives at
 * the bottom of this screen as soon as a valid business name produces a
 * usable slug. Brokers tap the link at the bottom to switch to the longer
 * flow that handles brokerage data.
 */
export function OnboardingQuick({ defaultName }: Props) {
  const router = useRouter();
  const [name, setName] = useState(defaultName || '');
  const [businessName, setBusinessName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>({ kind: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Auto-derive slug from business name until the user manually edits it.
  // Once they've touched the slug field, stop overwriting their work.
  useEffect(() => {
    if (slugTouched) return;
    setSlug(normalizeSlug(businessName));
  }, [businessName, slugTouched]);

  // Debounced slug availability check. Run on every change after we have
  // at least 3 valid characters; report state inline.
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkSeq = useRef(0);
  useEffect(() => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    if (!slug) {
      setSlugState({ kind: 'idle' });
      return;
    }
    if (!isValidSlug(slug)) {
      setSlugState({ kind: 'invalid', message: 'Use 3+ lowercase letters, numbers, or dashes.' });
      return;
    }
    setSlugState({ kind: 'checking' });
    const seq = ++checkSeq.current;
    checkTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check_slug', slug }),
        });
        if (seq !== checkSeq.current) return; // stale
        if (!res.ok) {
          setSlugState({ kind: 'invalid', message: "Couldn't check that one. Try again." });
          return;
        }
        const data = await res.json();
        if (data.reason === 'invalid') {
          setSlugState({ kind: 'invalid', message: 'Use 3+ lowercase letters, numbers, or dashes.' });
        } else if (data.available) {
          setSlugState({ kind: 'available' });
        } else {
          setSlugState({ kind: 'taken' });
        }
      } catch {
        if (seq !== checkSeq.current) return;
        setSlugState({ kind: 'invalid', message: "I lost the connection. Try again." });
      }
    }, 350);
    return () => {
      if (checkTimer.current) clearTimeout(checkTimer.current);
    };
  }, [slug]);

  const canSubmit =
    !submitting &&
    name.trim().length > 0 &&
    businessName.trim().length > 0 &&
    slugState.kind === 'available';

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;
      setSubmitting(true);
      setSubmitError(null);
      try {
        const profileRes = await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save_profile',
            name: name.trim(),
            businessName: businessName.trim(),
          }),
        });
        if (!profileRes.ok) throw new Error('profile');

        const spaceRes = await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create_space',
            slug,
            businessName: businessName.trim(),
            intakePageTitle: 'Rental Application',
            intakePageIntro: 'Share a few details so I can review your rental fit faster.',
          }),
        });
        if (!spaceRes.ok) {
          if (spaceRes.status === 409) {
            setSlugState({ kind: 'taken' });
            setSubmitError('That URL was just taken — pick another.');
            return;
          }
          throw new Error('space');
        }

        const completeRes = await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'complete', accountType: 'realtor' }),
        });
        if (!completeRes.ok) throw new Error('complete');

        toast.success("You're in. Here's your workspace.");
        router.push(`/s/${slug}/chippi`);
      } catch {
        setSubmitError("Couldn't finish setup. Please try again.");
        setSubmitting(false);
      }
    },
    [canSubmit, name, businessName, slug, router],
  );

  // Display URL preview lives inline under the slug field. Use the configured
  // root domain so this matches what gets generated post-setup.
  const linkPreview = slug ? `${rootDomain}/apply/${slug}` : `${rootDomain}/apply/your-business`;

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-background">
      <div className="w-full max-w-md space-y-10">
        <div className="space-y-3 text-center">
          <h1
            className="text-4xl tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-title)' }}
          >
            I keep your day moving
          </h1>
          <p
            className="text-3xl tracking-tight text-muted-foreground"
            style={{ fontFamily: 'var(--font-title)' }}
          >
            so you don&apos;t have to.
          </p>
          <p className="text-sm text-muted-foreground/80 pt-2">
            Two questions to get started.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-xs font-medium text-muted-foreground">
              Your name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              autoFocus={!defaultName}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              placeholder="Sarah Chen"
              className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="business" className="text-xs font-medium text-muted-foreground">
              What should leads call your business?
            </label>
            <input
              id="business"
              type="text"
              autoComplete="organization"
              autoFocus={!!defaultName}
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              disabled={submitting}
              placeholder="Park Slope Rentals"
              className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />

            <div className="pt-1.5 flex items-center gap-2 text-xs text-muted-foreground min-h-[20px]">
              <span className="font-mono truncate">{linkPreview}</span>
              {slugState.kind === 'checking' && (
                <Loader2 size={11} className="animate-spin flex-shrink-0" />
              )}
              {slugState.kind === 'available' && (
                <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              )}
              {slugState.kind === 'taken' && (
                <span className="text-amber-600 dark:text-amber-400 flex-shrink-0">
                  taken — pick a different name
                </span>
              )}
              {slugState.kind === 'invalid' && (
                <span className="text-amber-600 dark:text-amber-400 flex-shrink-0 truncate">
                  {slugState.message}
                </span>
              )}
            </div>

            {slugTouched && (
              <input
                aria-label="Custom URL slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(normalizeSlug(e.target.value))}
                disabled={submitting}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
            )}

            {!slugTouched && slugState.kind === 'taken' && (
              <button
                type="button"
                onClick={() => setSlugTouched(true)}
                className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Edit URL
              </button>
            )}
          </div>

          {submitError && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/40 px-3 py-2.5 text-sm text-rose-800 dark:text-rose-200">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-foreground text-background px-4 py-3 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <>
                Get my intake link
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>

        <div className="text-center">
          <a
            href="/setup?type=broker"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Setting up a brokerage instead?
          </a>
        </div>
      </div>
    </div>
  );
}
