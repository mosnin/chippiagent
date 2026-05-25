import { Redis } from '@upstash/redis';

let _redis: Redis | null = null;

function createRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    // Don't log on every call — only first time
    return null;
  }
  return new Redis({ url, token });
}

/**
 * Lazy Redis singleton. Returns a no-op proxy if env vars are missing,
 * so callers never crash from a missing Redis connection.
 */
export const redis: Redis = new Proxy({} as Redis, {
  get(_target, prop) {
    if (!_redis) {
      _redis = createRedis();
    }
    if (!_redis) {
      // Return safe no-op functions for common Redis methods
      if (typeof prop === 'string' && ['get', 'set', 'del', 'incr', 'expire', 'exists', 'hset', 'hget', 'hgetall'].includes(prop)) {
        return async (..._args: any[]) => null;
      }
      return undefined;
    }
    const value = (_redis as any)[prop];
    if (typeof value === 'function') {
      return value.bind(_redis);
    }
    return value;
  },
});
