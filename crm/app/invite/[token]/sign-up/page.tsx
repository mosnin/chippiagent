import { BrandLogo } from '@/components/brand-logo';
import { ThemedSignUp } from '@/components/auth/clerk-sign-up';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Join Brokerage — Chippi' };

export default async function InviteSignUpPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Fetch invitation details to show brokerage name
  let brokerageName = 'a brokerage';
  try {
    const { data } = await supabase
      .from('Invitation')
      .select('Brokerage(name)')
      .eq('token', token)
      .maybeSingle();
    if (data?.Brokerage && typeof data.Brokerage === 'object' && 'name' in data.Brokerage) {
      brokerageName = (data.Brokerage as { name: string }).name;
    }
  } catch {
    // Non-blocking
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel — Sign up form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <BrandLogo className="h-7 mx-auto" alt="Chippi" />
            <h1 className="text-xl font-bold mt-4">Join {brokerageName}</h1>
            <p className="text-sm text-muted-foreground">
              Create your account to accept the invitation and access the brokerage dashboard.
            </p>
          </div>

          <ThemedSignUp
            routing="path"
            path={`/invite/${token}/sign-up`}
            forceRedirectUrl={`/invite/${token}`}
            signInUrl={`/invite/${token}/sign-in`}
          />

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              href={`/login/realtor?redirect_url=${encodeURIComponent(`/invite/${token}`)}`}
              className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
            >
              Sign in
            </Link>
          </p>

          <p className="text-center text-[11px] text-muted-foreground">
            By continuing, you agree to our{' '}
            <Link href="/legal/terms" className="underline">Terms of Service</Link>{' '}
            and{' '}
            <Link href="/legal/privacy" className="underline">Privacy Policy</Link>.
          </p>
        </div>
      </div>

      {/* Right panel — decorative (hidden on mobile) */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-primary/5 to-primary/10 items-center justify-center">
        <div className="text-center space-y-3 px-8">
          <p className="text-2xl font-bold">Welcome to the team</p>
          <p className="text-muted-foreground max-w-sm">
            You&apos;ve been invited to join {brokerageName} on Chippi. Create your account to get started.
          </p>
        </div>
      </div>
    </div>
  );
}
