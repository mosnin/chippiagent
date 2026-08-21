/**
 * Route-level tests for `POST /api/webhooks/stripe`.
 *
 * Guards the two contracts that drop or forge billing events:
 *   - Unsigned / bad-signature payloads never reach Space/Brokerage writes
 *   - Redis idempotency is recorded AFTER a successful handler, so a
 *     mid-handler 500 does not make Stripe's retry a silent no-op
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { constructEvent, retrieve, redisGet, redisSet, supabaseFrom } = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  retrieve: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  supabaseFrom: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: { constructEvent },
    subscriptions: { retrieve },
  }),
}));

vi.mock('@/lib/redis', () => ({
  redis: {
    get: redisGet,
    set: redisSet,
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: supabaseFrom },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { POST } from '@/app/api/webhooks/stripe/route';

const ENV_KEYS = ['STRIPE_WEBHOOK_SECRET'] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function snapshotEnv() {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
}
function restoreEnv() {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
}

function request(opts: { sig?: string | null; body?: string } = {}) {
  const headers = new Headers();
  if (opts.sig !== null) headers.set('stripe-signature', opts.sig ?? 't=1,v1=sig');
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers,
    body: opts.body ?? '{"id":"evt_1"}',
  });
}

function verifiedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_1',
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_1',
        status: 'active',
        customer: 'cus_1',
        start_date: 1_700_000_000,
        items: { data: [{ current_period_end: 1_700_086_400 }] },
        metadata: { spaceId: 'space_1' },
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  snapshotEnv();
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  constructEvent.mockReset();
  retrieve.mockReset();
  redisGet.mockReset();
  redisSet.mockReset();
  supabaseFrom.mockReset();
  redisGet.mockResolvedValue(null);
  redisSet.mockResolvedValue('OK');
});

afterEach(() => {
  restoreEnv();
});

describe('POST /api/webhooks/stripe — signature', () => {
  it('rejects a missing stripe-signature header without touching Redis', async () => {
    const res = await POST(request({ sig: null }) as never);
    expect(res.status).toBe(400);
    expect(constructEvent).not.toHaveBeenCalled();
    expect(redisGet).not.toHaveBeenCalled();
    expect(redisSet).not.toHaveBeenCalled();
    expect(supabaseFrom).not.toHaveBeenCalled();
  });

  it('rejects a payload Stripe will not verify', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload');
    });
    const res = await POST(request() as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
    expect(redisGet).not.toHaveBeenCalled();
    expect(redisSet).not.toHaveBeenCalled();
    expect(supabaseFrom).not.toHaveBeenCalled();
  });

  it('fails closed when STRIPE_WEBHOOK_SECRET is unset', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(request() as never);
    expect(res.status).toBe(500);
    expect(constructEvent).not.toHaveBeenCalled();
    expect(supabaseFrom).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/stripe — idempotency', () => {
  it('acks a duplicate event without writing billing state or re-marking Redis', async () => {
    constructEvent.mockReturnValue(verifiedEvent());
    redisGet.mockResolvedValue('1');

    const res = await POST(request() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(redisGet).toHaveBeenCalledWith('stripe:event:evt_1');
    expect(redisSet).not.toHaveBeenCalled();
    expect(supabaseFrom).not.toHaveBeenCalled();
  });

  it('does not mark Redis when the handler throws, so Stripe can retry', async () => {
    constructEvent.mockReturnValue(verifiedEvent());
    supabaseFrom.mockImplementation(() => {
      throw new Error('db down');
    });

    const res = await POST(request() as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Webhook handler failed' });
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('marks Redis only after a successful Space status update', async () => {
    const order: string[] = [];
    constructEvent.mockReturnValue(verifiedEvent());
    redisGet.mockImplementation(async () => {
      order.push('get');
      return null;
    });
    redisSet.mockImplementation(async () => {
      order.push('set');
      return 'OK';
    });

    const chain: Record<string, unknown> = {};
    const pass = () => chain;
    chain.select = vi.fn(pass);
    chain.eq = vi.fn(pass);
    chain.update = vi.fn((..._args: unknown[]) => {
      order.push('update');
      return chain;
    });
    chain.maybeSingle = vi.fn(async () => {
      order.push('read');
      return { data: { stripeCustomerId: 'cus_1' }, error: null };
    });
    supabaseFrom.mockReturnValue(chain);

    const res = await POST(request() as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(redisSet).toHaveBeenCalledWith('stripe:event:evt_1', '1', { ex: 86400 });
    expect(order).toEqual(['get', 'read', 'update', 'set']);
  });
});
