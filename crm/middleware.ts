import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const isProtectedRoute = createRouteMatcher([
  '/s/(.*)',
  '/setup(.*)',
  '/admin(.*)',
  '/broker(.*)',
  '/invite/(.*)',
  '/join/(.*)',
  '/auth/(.*)',
  '/authorize',
  '/subscribe',
  '/billing-required',
]);

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/login/(.*)',
]);

const isAdminRoute = createRouteMatcher([
  '/admin(.*)',
  '/api/admin(.*)'
]);

// Routes where a secondary DB-level banned check is performed.
// Only write operations (POST/PUT/PATCH/DELETE) on API routes and all admin routes,
// to avoid a DB round-trip on every GET request.
const isWriteApiRoute = createRouteMatcher([
  '/api/(.*)',
]);

/**
 * Lazy-initialized Supabase client for middleware-only use.
 * We avoid importing from lib/supabase because Edge middleware
 * may run in a different runtime context.
 */
let _mwSupabase: ReturnType<typeof createClient> | null = null;
function getMwSupabase() {
  if (_mwSupabase) return _mwSupabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _mwSupabase = createClient(url, key);
  return _mwSupabase;
}

// Public-facing pages that never need auth — skip the Clerk session
// lookup entirely so these routes aren't blocked by the auth round-trip.
const isFullyPublicRoute = createRouteMatcher([
  '/apply/(.*)',
  '/apply/b/(.*)',
  '/book/(.*)',
  '/p/(.*)',                 // realtor public "link in bio" pages
  '/status/(.*)',
  '/packet/(.*)',            // tokenised listing-packet share pages (Phase 11)
  '/api/packet/(.*)',        // token-scoped signed-URL endpoint for packet docs
  '/api/public/(.*)',
  '/api/webhooks/(.*)',
  '/api/mcp',
  '/api/mcp/oauth/token',
  '/api/tours/book',
  '/.well-known/(.*)',
  '/invite/(.*)/sign-up(.*)',
  '/invite/(.*)/sign-in(.*)',
]);

// Routes that should NEVER be passed as redirect_url after login.
// Only actual dashboard pages (/s/...) are valid post-login destinations.
const SAFE_REDIRECT_PREFIXES = ['/s/', '/broker', '/admin', '/authorize', '/invite/', '/subscribe', '/billing-required'];

export default clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl;

  // Fast-path: public-facing pages skip the Clerk auth() call entirely.
  // This avoids an external API round-trip that adds seconds to page load.
  // The x-public-page header tells the root layout to skip ClerkProvider
  // so Clerk's client-side JS doesn't prompt visitors to sign in.
  if (isFullyPublicRoute(request)) {
    const headers = new Headers(request.headers);
    headers.set('x-public-page', '1');
    return NextResponse.next({ request: { headers } });
  }

  const session = await auth();

  // `/` → send everyone to the right place immediately.
  if (pathname === '/') {
    if (session.userId) {
      return NextResponse.redirect(new URL('/auth/redirect?intent=realtor', request.url));
    }
    return NextResponse.redirect(new URL('/login/realtor', request.url));
  }

  // Authenticated users on auth pages → send to their dashboard.
  if (session.userId && (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up') || pathname.startsWith('/login'))) {
    // Preserve intent from the page they're on (broker login → broker intent)
    const isBrokerPath = pathname.startsWith('/login/broker');
    const isBrokerIntent = request.nextUrl.searchParams.get('intent') === 'broker';
    const intent = isBrokerPath || isBrokerIntent ? 'broker' : 'realtor';
    return NextResponse.redirect(new URL(`/auth/redirect?intent=${intent}`, request.url));
  }

  // Block suspended (banned) users from accessing protected routes.
  // Clerk's banUser invalidates sessions, but this serves as a safety net
  // in case a session token is still valid during the propagation window.
  if (session.userId) {
    const metadata = (session.sessionClaims?.publicMetadata ?? {}) as Record<string, unknown>;
    if (metadata.banned === true) {
      // Sign out banned users by redirecting to login with a message
      const bannedUrl = new URL('/login/realtor', request.url);
      bannedUrl.searchParams.set('reason', 'suspended');
      return NextResponse.redirect(bannedUrl);
    }

    // Secondary DB-level banned check for write operations and admin routes.
    // This catches cases where the Clerk metadata hasn't propagated yet but
    // the user was already marked as banned in the database.
    const isWriteMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
    const needsDbBanCheck =
      isAdminRoute(request) || (isWriteMethod && isWriteApiRoute(request));

    if (needsDbBanCheck) {
      const sb = getMwSupabase();
      if (sb) {
        try {
          const { data: dbUser } = await sb
            .from('User')
            .select('platformRole')
            .eq('clerkId', session.userId)
            .maybeSingle<{ platformRole: string | null }>();
          if (dbUser?.platformRole === 'banned') {
            const bannedUrl = new URL('/login/realtor', request.url);
            bannedUrl.searchParams.set('reason', 'suspended');
            return NextResponse.redirect(bannedUrl);
          }
        } catch {
          // If the DB check fails, don't block the request — the Clerk
          // metadata check above is the primary guard.
        }
      }
    }
  }

  // Protected routes: must be logged in.
  if (isProtectedRoute(request) && !isPublicRoute(request)) {
    if (!session.userId) {
      // Redirect to login. Only pass redirect_url for safe dashboard pages —
      // never for /setup, /auth/redirect, etc. to avoid Clerk honouring a
      // redirect_url that skips the proper post-signup flow.
      // For invite pages, send to sign-up (invitees likely don't have accounts yet)
      const isInvitePath = pathname.startsWith('/invite/');
      const authPage = isInvitePath ? '/sign-up' : '/login/realtor';
      const authUrl = new URL(authPage, request.url);
      const isSafeRedirect = SAFE_REDIRECT_PREFIXES.some((p) => pathname.startsWith(p));
      if (isSafeRedirect) {
        authUrl.searchParams.set('redirect_url', pathname);
      }
      return NextResponse.redirect(authUrl);
    }

    // Admin route protection — lightweight check in middleware.
    // The layout performs the authoritative DB check via requireAdmin().
    // Here we only block users who are clearly NOT admins (no metadata claim).
    // Users with DB-only admin role (no Clerk metadata) are allowed through
    // so the layout can verify them against the database.
    if (isAdminRoute(request)) {
      // If user has Clerk metadata confirming non-admin, block early.
      // If metadata is missing/empty, let them through for DB check in layout.
      const metadata = (session.sessionClaims?.publicMetadata ?? {}) as Record<string, unknown>;
      const hasExplicitNonAdminRole = metadata.role !== undefined && metadata.role !== 'admin';
      if (hasExplicitNonAdminRole) {
        return NextResponse.redirect(new URL('/auth/redirect?intent=realtor', request.url));
      }
    }
  }

  // Pass the current pathname to layouts via request header (used by subscription gate)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)'
  ]
};
