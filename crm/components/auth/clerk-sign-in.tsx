'use client';

import { SignIn } from '@clerk/nextjs';
import { useTheme } from '@/components/theme-provider';
import { clerkAuthAppearance } from './clerk-appearance';

// Clerk's SignIn is a discriminated union on `routing`/`path`, so narrowing
// a prop-spread through React.ComponentProps collapses to the wrong member.
// We pass through whatever props the caller supplies — the runtime contract
// is unchanged — so cast to the union-wide type.
type SignInProps = React.ComponentProps<typeof SignIn>;

export function ThemedSignIn(props: Omit<SignInProps, 'appearance'>) {
  const { theme } = useTheme();
  const Component = SignIn as React.ComponentType<SignInProps>;
  return <Component {...(props as SignInProps)} appearance={clerkAuthAppearance(theme === 'dark')} />;
}
