import type { NextConfig } from "next";

/**
 * Security response headers applied to every route.
 *
 * Stripe domains are now included in the allowlists below (connect-src,
 * frame-src, script-src) via the CSP header — once a full CSP is added.
 * For now the CSP is omitted (see note below), but the domains are documented.
 */
const securityHeaders = [
  // Prevent embedding in iframes from other origins (clickjacking)
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Prevent MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Limit referrer info sent to cross-origin requests
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable unused browser features (microphone allowed for voice mode)
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=()' },
  // Force HTTPS for 2 years (only active when served over TLS)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Content Security Policy (report-only — enforcing breaks Clerk auth components)
  {
    key: 'Content-Security-Policy-Report-Only',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.clerk.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://img.clerk.com https://*.clerk.com https://*.stripe.com",
      "connect-src 'self' https://api.stripe.com https://*.clerk.accounts.dev https://*.clerk.com https://*.supabase.co wss://*.supabase.co",
      "frame-src https://js.stripe.com https://hooks.stripe.com https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
