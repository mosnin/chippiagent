import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkIdempotency,
  makeIdempotencyKey,
  resetIdempotencyStore,
  storeIdempotency,
  withIdempotency,
} from '@/lib/agent/ts-idempotency';

describe('ts-idempotency', () => {
  beforeEach(() => {
    resetIdempotencyStore();
  });

  it('does not collapse distinct arg tuples that contain colons', () => {
    const a = makeIdempotencyKey('send_sms', 'space', '+1', '555:hi');
    const b = makeIdempotencyKey('send_sms', 'space', '+1:555', 'hi');
    expect(a).not.toBe(b);
  });

  it('coalesces in-flight callers so a concurrent retry cannot send twice', async () => {
    let starts = 0;
    let finish!: (value: boolean) => void;
    const gate = new Promise<boolean>((resolve) => {
      finish = resolve;
    });

    const first = withIdempotency('sms:1', async () => {
      starts += 1;
      return gate;
    });
    const second = withIdempotency('sms:1', async () => {
      starts += 1;
      return true;
    });

    finish(true);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(starts).toBe(1);
  });

  it('does not cache a failed send — a retry must be allowed to fire', async () => {
    let calls = 0;
    const failed = await withIdempotency('sms:fail', async () => {
      calls += 1;
      return false;
    });
    const retried = await withIdempotency('sms:fail', async () => {
      calls += 1;
      return true;
    });
    expect(failed).toBe(false);
    expect(retried).toBe(true);
    expect(calls).toBe(2);
    expect(checkIdempotency('sms:fail')).toBe(true);
  });

  it('does not persist a null result that would look like a miss', async () => {
    await withIdempotency('sms:null', async () => null);
    expect(checkIdempotency('sms:null')).toBeNull();
    let calls = 0;
    await withIdempotency('sms:null', async () => {
      calls += 1;
      return 'sent';
    });
    expect(calls).toBe(1);
  });

  it('returns the cached success on a later retry', async () => {
    let calls = 0;
    const first = await withIdempotency('sms:ok', async () => {
      calls += 1;
      return { delivered: true };
    });
    const second = await withIdempotency('sms:ok', async () => {
      calls += 1;
      return { delivered: false };
    });
    expect(first).toEqual({ delivered: true });
    expect(second).toEqual({ delivered: true });
    expect(calls).toBe(1);
  });

  it('refuses to store a false result through storeIdempotency', () => {
    storeIdempotency('sms:store-false', false);
    expect(checkIdempotency('sms:store-false')).toBeNull();
  });
});
