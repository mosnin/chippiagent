import { AuthPageLayout } from '@/components/auth/auth-page-layout';
import { ThemedSignUp } from '@/components/auth/clerk-sign-up';
import Link from 'next/link';
import type { Metadata } from 'next';
import { BODY_MUTED, QUIET_LINK } from '@/lib/typography';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Sign Up — Chippi' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string; redirect_url?: string }>;
}) {
  const { intent, redirect_url } = await searchParams;
  const isBroker = intent === 'broker';
  const redirectIntent = isBroker ? 'broker' : 'realtor';
  const signInBase = isBroker ? '/login/broker' : '/login/realtor';
  // Validate redirect_url: allow safe internal paths, block path traversal
  const SAFE_PREFIXES = ['/s/', '/broker', '/admin', '/invite/', '/subscribe', '/billing-required', '/authorize'];
  const isSafeRedirect = redirect_url
    && SAFE_PREFIXES.some(p => redirect_url.startsWith(p))
    && !redirect_url.includes('..');
  const signInUrl = isSafeRedirect
    ? `${signInBase}?redirect_url=${encodeURIComponent(redirect_url!)}`
    : signInBase;

  const postSignUpUrl = isSafeRedirect
    ? redirect_url!
    : `/auth/redirect?intent=${redirectIntent}`;

  return (
    <AuthPageLayout
      heading="Set up Chippi."
      subheading="Two minutes."
      variant={isBroker ? 'broker' : 'realtor'}
    >
      <div className="w-full space-y-4">
        <ThemedSignUp
          routing="path"
          path="/sign-up"
          forceRedirectUrl={postSignUpUrl}
          signInUrl={signInUrl}
        />
        <p className={cn(BODY_MUTED, 'text-center')}>
          Already have an account?{' '}
          <Link href={signInUrl} className={cn(QUIET_LINK, 'underline underline-offset-4')}>
            Sign in
          </Link>
        </p>
      </div>
    </AuthPageLayout>
  );
}
