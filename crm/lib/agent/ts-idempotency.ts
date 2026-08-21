// Idempotency key store for mutation tools.
// In-process cache with 5-minute TTL — prevents duplicate side effects
// on retry within the same Vercel function instance lifetime.

export interface IdempotencyEntry {
  result: unknown;
  expiresAt: number;
}

const store = new Map<string, IdempotencyEntry>();
const inflight = new Map<string, Promise<unknown>>();
const TTL_MS = 5 * 60 * 1000;

function isCacheableResult(result: unknown): boolean {
  // false = sendSMS / similar "we did not deliver". Caching that turns a
  // transient Telnyx miss into a 5-minute black hole and drops a unique
  // send that still needs to go out. null/undefined have the same shape:
  // checkIdempotency already treated them as a miss, so storing them
  // never protected anything.
  return result !== false && result !== null && result !== undefined;
}

export function makeIdempotencyKey(toolName: string, spaceId: string, ...args: string[]): string {
  // JSON array is unambiguous. Joining with ':' collapsed
  // ('+1', '555:hi') and ('+1:555', 'hi') into the same key, so a unique
  // SMS could be treated as a duplicate and dropped.
  return JSON.stringify([toolName, spaceId, ...args]);
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
  if (!isCacheableResult(result)) return;
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

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = Promise.resolve()
    .then(() => fn())
    .then((result) => {
      storeIdempotency(key, result);
      return result;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise as Promise<T>;
}

/** Test-only: wipe the in-process maps so cases cannot leak across tests. */
export function resetIdempotencyStore(): void {
  store.clear();
  inflight.clear();
}
