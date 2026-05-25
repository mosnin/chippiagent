import { redis } from '@/lib/redis';

// ── IP extraction helper ────────────────────────────────────────────────────
// On Vercel, X-Forwarded-For is set by the edge network and cannot be spoofed
// by the end-user — Vercel always overwrites the header with the true client IP
// as the first entry. The same applies to Cloudflare (CF-Connecting-IP) and
// AWS ALB. If you self-host behind a different reverse proxy, ensure it strips
// or overwrites the X-Forwarded-For header before reaching the app.
//
// Even so, we validate the extracted value to reject obviously malformed IPs
// (e.g. extremely long strings, embedded payloads) which could bloat rate-limit
// keys or Redis storage.

const IPV4_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const IPV6_REGEX = /^[a-fA-F0-9:]+$/;

/**
 * Extract and validate the client IP from a request.
 * Returns a sanitised IP string suitable for use in rate-limit keys.
 *
 * Only the first entry in X-Forwarded-For is used (the one the reverse proxy
 * sets). If the value doesn't look like a valid IP, falls back to 'unknown'.
 */
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const raw = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  if (!raw || raw.length > 45) return 'unknown';

  // Quick structural check — must look like an IPv4 or IPv6 address
  if (IPV4_REGEX.test(raw) || IPV6_REGEX.test(raw)) {
    return raw;
  }

  return 'unknown';
}

/**
 * In-memory fallback rate limiter (bounded LRU).
 * Used when Redis is unavailable. Tracks last N IPs.
 */
// In-memory fallback only — Redis should be the primary rate limiter in production.
// 10 000 entries is enough to resist trivial eviction attacks while keeping memory bounded.
const MEM_MAX_ENTRIES = 10_000;
const memStore = new Map<string, { count: number; expiresAt: number }>();
let redisFailCount = 0;

function memIncr(key: string, windowSeconds: number): number {
  const now = Date.now();
  // Evict expired entries periodically
  if (memStore.size > MEM_MAX_ENTRIES) {
    for (const [k, v] of memStore) {
      if (v.expiresAt < now) memStore.delete(k);
      if (memStore.size <= MEM_MAX_ENTRIES * 0.8) break;
    }
  }
  const entry = memStore.get(key);
  if (entry && entry.expiresAt > now) {
    entry.count++;
    return entry.count;
  }
  memStore.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
  return 1;
}

/**
 * Increment a sliding-window counter in Redis.
 * Returns { allowed: true } if under the limit, { allowed: false } if over.
 * Falls back to in-memory counter if Redis is unavailable.
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<{ allowed: boolean }> {
  // If Redis has failed repeatedly, use in-memory directly
  if (redisFailCount >= 3) {
    const count = memIncr(key, windowSeconds);
    return { allowed: count <= max };
  }

  try {
    const count = await redis.incr(key);
    // null is returned by the no-op proxy when Redis env vars are missing.
    // Treat it as a Redis failure and fall through to in-memory.
    if (count === null) {
      redisFailCount++;
      const memCount = memIncr(key, windowSeconds);
      return { allowed: memCount <= max };
    }
    // EXPIRE … NX sets the TTL only when the key has none — covers the first
    // increment AND self-heals a key whose earlier EXPIRE was skipped (a crash
    // or transient error between INCR and EXPIRE). NX means a fixed window:
    // the TTL is never extended while calls keep coming in.
    await redis.expire(key, windowSeconds, 'NX');
    redisFailCount = 0; // Reset on success
    return { allowed: count <= max };
  } catch {
    redisFailCount++;
    // Fall back to in-memory rate limiting
    const count = memIncr(key, windowSeconds);
    return { allowed: count <= max };
  }
}
