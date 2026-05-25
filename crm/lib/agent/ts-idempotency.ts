// Idempotency key store for mutation tools
// In-process cache with 5-minute TTL — prevents duplicate side effects
// on retry within the same Vercel function instance lifetime.

export interface IdempotencyEntry {
  result: unknown;
  expiresAt: number;
}

const store = new Map<string, IdempotencyEntry>();
const TTL_MS = 5 * 60 * 1000;

export function makeIdempotencyKey(toolName: string, spaceId: string, ...args: string[]): string {
  // Simple deterministic key — no crypto needed for in-memory cache
  return `${toolName}:${spaceId}:${args.join(':')}`;
}

export function checkIdempotency(key: string): unknown | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.result;
}

export function storeIdempotency(key: string, result: unknown): void {
  store.set(key, { result, expiresAt: Date.now() + TTL_MS });
}

export function withIdempotency<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  // Read the store directly rather than via checkIdempotency: that helper
  // returns null for BOTH "miss" and "cached a null result", so a tool that
  // legitimately resolves to null/undefined would re-execute on every retry.
  const entry = store.get(key);
  if (entry) {
    if (Date.now() <= entry.expiresAt) return Promise.resolve(entry.result as T);
    store.delete(key);
  }
  return fn().then(result => {
    storeIdempotency(key, result);
    return result;
  });
}
