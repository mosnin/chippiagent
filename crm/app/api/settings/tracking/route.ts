import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import type { TrackingPixels } from '@/lib/types';

// Pixel ID fields must be alphanumeric + hyphens only (prevent XSS via ID injection)
const PIXEL_ID_REGEX = /^[a-zA-Z0-9\-_]+$/;

const PIXEL_ID_FIELDS: (keyof TrackingPixels)[] = [
  'facebookPixelId',
  'tiktokPixelId',
  'googleAnalyticsId',
  'googleAdsId',
  'twitterPixelId',
  'linkedinPartnerId',
  'snapchatPixelId',
];

function validatePixelId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!PIXEL_ID_REGEX.test(trimmed)) return null;
  // Cap length at 100 characters
  return trimmed.slice(0, 100);
}

/**
 * Allowlisted domains for tracking pixel scripts.
 * Only script src attributes pointing to these domains are permitted.
 */
const ALLOWED_SCRIPT_DOMAINS = [
  'connect.facebook.net',
  'www.facebook.com',
  'analytics.tiktok.com',
  'www.googletagmanager.com',
  'www.google-analytics.com',
  'googleads.g.doubleclick.net',
  'static.ads-twitter.com',
  'snap.licdn.com',
  'sc-static.net',
  'www.google.com',
  'cdn.amplitude.com',
  'js.hs-scripts.com',
  'js.hs-analytics.net',
  'www.clarity.ms',
  'cdn.segment.com',
];

/**
 * Sanitize custom head script to prevent stored XSS.
 *
 * Strategy: strict allowlist approach.
 * - Only allow <script> tags with src attributes pointing to ALLOWED_SCRIPT_DOMAINS (HTTPS only)
 * - Block ALL inline scripts (no dangerouslySetInnerHTML of user-provided JS)
 * - Block event handlers (onclick, onerror, onload, etc.)
 * - Block data: URIs, javascript: URIs, and other dangerous patterns
 * - Cap at 5KB
 */
function sanitizeCustomScript(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Cap at 5KB
  const capped = trimmed.slice(0, 5_000);

  // Block dangerous patterns outright
  const dangerousPatterns = [
    /javascript\s*:/gi,
    /data\s*:/gi,
    /vbscript\s*:/gi,
    /on\w+\s*=/gi,               // event handlers: onclick=, onerror=, onload=, etc.
    /expression\s*\(/gi,         // CSS expression()
    /url\s*\(/gi,                // CSS url()
    /<iframe/gi,
    /<object/gi,
    /<embed/gi,
    /<form/gi,
    /<input/gi,
    /<link/gi,
    /<style/gi,
    /<meta/gi,
    /<base/gi,
    /<svg/gi,
    /document\s*\./gi,
    /window\s*\./gi,
    /eval\s*\(/gi,
    /Function\s*\(/gi,
    /setTimeout\s*\(/gi,
    /setInterval\s*\(/gi,
    /import\s*\(/gi,
    /fetch\s*\(/gi,
    /XMLHttpRequest/gi,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(capped)) {
      return null; // Reject the entire script if any dangerous pattern is found
    }
  }

  // Extract all script src URLs and validate against allowlist
  const scriptSrcRegex = /<script[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match;
  const srcUrls: string[] = [];
  while ((match = scriptSrcRegex.exec(capped)) !== null) {
    srcUrls.push(match[1]);
  }

  // If there are script tags without src (inline scripts), reject
  const allScriptTags = capped.match(/<script[^>]*>/gi) ?? [];
  const scriptTagsWithSrc = capped.match(/<script[^>]*\bsrc\s*=/gi) ?? [];
  if (allScriptTags.length > scriptTagsWithSrc.length) {
    // Inline script detected — block it
    return null;
  }

  // Validate all src URLs against domain allowlist
  for (const url of srcUrls) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        return null; // Only HTTPS allowed
      }
      if (!ALLOWED_SCRIPT_DOMAINS.some(domain => parsed.hostname === domain || parsed.hostname.endsWith('.' + domain))) {
        return null; // Domain not in allowlist
      }
    } catch {
      return null; // Invalid URL
    }
  }

  return capped;
}

async function resolveSpaceFromSlug(slug: string, clerkUserId: string) {
  // Get our DB user
  const { data: user, error: userError } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', clerkUserId)
    .maybeSingle();
  if (userError || !user) return null;

  // Get space and verify ownership
  const { data: space, error: spaceError } = await supabase
    .from('Space')
    .select('id, slug')
    .eq('slug', slug)
    .eq('ownerId', user.id)
    .maybeSingle();
  if (spaceError || !space) return null;

  return space;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
  }

  const space = await resolveSpaceFromSlug(slug, userId);
  if (!space) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: settings, error } = await supabase
    .from('SpaceSetting')
    .select('trackingPixels')
    .eq('spaceId', space.id)
    .maybeSingle();

  if (error) {
    console.error('[api/settings/tracking] GET error:', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }

  return NextResponse.json({
    trackingPixels: settings?.trackingPixels ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = typeof body.slug === 'string' ? body.slug : null;
  if (!slug) {
    return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
  }

  const space = await resolveSpaceFromSlug(slug, userId);
  if (!space) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Rate limit: 10 tracking pixel updates per user per hour
  const { allowed } = await checkRateLimit(`tracking:put:${userId}`, 10, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many updates. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  // Validate and build trackingPixels JSONB
  const pixels = body.trackingPixels as Record<string, unknown> | undefined;
  if (!pixels || typeof pixels !== 'object') {
    return NextResponse.json({ error: 'Missing trackingPixels object' }, { status: 400 });
  }

  const validationErrors: string[] = [];
  const sanitized: TrackingPixels = {};

  for (const field of PIXEL_ID_FIELDS) {
    const raw = pixels[field];
    if (raw !== undefined && raw !== null && raw !== '') {
      const clean = validatePixelId(raw);
      if (clean === null) {
        validationErrors.push(`${field}: must be alphanumeric (letters, numbers, hyphens, underscores only)`);
      } else {
        (sanitized as Record<string, string>)[field] = clean;
      }
    }
  }

  if (validationErrors.length > 0) {
    return NextResponse.json({ error: 'Validation failed', details: validationErrors }, { status: 400 });
  }

  // Handle custom head script
  const customScript = sanitizeCustomScript(pixels.customHeadScript);
  if (customScript) {
    sanitized.customHeadScript = customScript;
  }

  const { error: updateError } = await supabase
    .from('SpaceSetting')
    .update({ trackingPixels: sanitized })
    .eq('spaceId', space.id);

  if (updateError) {
    console.error('[api/settings/tracking] PUT error:', updateError);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, trackingPixels: sanitized });
}
