import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

/**
 * `/` is a routing-only page. Middleware handles the redirect for all users,
 * but this server component acts as a fallback in case middleware is bypassed.
 *
 * - Unauthenticated → /login/realtor
 * - Authenticated   → /auth/redirect (which routes to /s/{slug}, /broker, or /setup)
 */
export default async function HomePage() {
  const { userId } = await auth();

  if (userId) {
    redirect('/auth/redirect?intent=realtor');
  }

  redirect('/login/realtor');
}
