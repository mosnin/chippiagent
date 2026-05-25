import { protocol, rootDomain } from '@/lib/utils';

/**
 * Single source of truth for slug handling.
 * Chippi uses path slugs (`/apply/:slug`) and never host-based tenant URLs.
 */
export function normalizeSlug(raw: string) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
}

const RESERVED_SLUGS = new Set([
  'admin', 'api', 'www', 'apply', 'auth', 'billing', 'broker', 'book',
  'setup', 'onboard', 'dashboard', 'public', 'static', 'media', 'app',
  'system', 'support', 'help', 'login', 'signup', 'register', 'invite',
  'settings', 'profile', 'account', 'legal', 'privacy', 'terms',
  'features', 'pricing', 'blog', 'docs', 'status', 'health', 'debug',
  'test', 'demo', 'staging', 'dev', 'prod', 'cdn', 'assets', 'images',
  'uploads', 'files', 'download', 'webhook', 'webhooks', 'cron',
  'null', 'undefined', 'true', 'false', 'nan',
]);

export function isValidSlug(slug: string) {
  if (slug.length < 3) return false;
  if (RESERVED_SLUGS.has(slug)) return false;
  if (slug.startsWith('api-') || slug.startsWith('admin-')) return false;
  return normalizeSlug(slug) === slug;
}

export function buildIntakePath(slug: string) {
  return `/apply/${slug}`;
}

export function buildIntakeUrl(slug: string) {
  return `${protocol}://${rootDomain}${buildIntakePath(slug)}`;
}
