'use client';

import { SignUp } from '@clerk/nextjs';
import { useTheme } from '@/components/theme-provider';
import { clerkAuthAppearance } from './clerk-appearance';

// Clerk's SignUp is a discriminated union on `routing`/`path`; see
// clerk-sign-in.tsx for the same workaround rationale.
type SignUpProps = React.ComponentProps<typeof SignUp>;

export function ThemedSignUp(props: Omit<SignUpProps, 'appearance'>) {
  const { theme } = useTheme();
  const Component = SignUp as React.ComponentType<SignUpProps>;
  return <Component {...(props as SignUpProps)} appearance={clerkAuthAppearance(theme === 'dark')} />;
}
