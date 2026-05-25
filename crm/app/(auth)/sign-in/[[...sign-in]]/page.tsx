import { redirect } from 'next/navigation';

/**
 * Redirect /sign-in to /login/realtor so all sign-in flows use
 * Clerk's path-based routing consistently. This prevents mobile
 * navigation issues when switching between broker/realtor tabs.
 */
export default function SignInPage() {
  redirect('/login/realtor');
}
