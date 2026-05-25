import { BrandLogo } from '@/components/brand-logo';
import { ThemedSignIn } from '@/components/auth/clerk-sign-in';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sign in to Accept Invite — Chippi' };

export default async function InviteSignInPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <BrandLogo className="h-7 mx-auto" alt="Chippi" />
          <h1 className="text-xl font-bold mt-4">Sign in to accept invite</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to your existing account to accept the brokerage invitation.
          </p>
        </div>

        <ThemedSignIn
          routing="path"
          path={`/invite/${token}/sign-in`}
          forceRedirectUrl={`/invite/${token}`}
          signUpUrl={`/invite/${token}/sign-up`}
        />

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link
            href={`/invite/${token}/sign-up`}
            className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
