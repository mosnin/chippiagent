/**
 * Entitlement contracts for POST /api/webhooks/stripe.
 *
 * Two production failures this file locks down:
 *
 * 1. Grant-without-id. `customer.subscription.updated` used to write only
 *    status + period end. If checkout.session.completed never persisted
 *    stripeSubscriptionId, later customer.subscription.deleted /
 *    invoice.payment_failed keyed on that id hit 0 rows — the space stayed
 *    `active` after cancel or a failed renewal (paid access for free).
 *
 * 2. Dedup-before-commit. Redis was marked processed *before* the handler
 *    ran. A thrown retrieve / DB write returned 500, Stripe retried, we
 *    skipped the retry, and a paying team stayed locked out.
 *
 * Mock strategy mirrors tests/api/agent-sweep.test.ts: queue terminals on
 * `@/lib/supabase`, stub Stripe constructEvent + retrieve, in-memory Redis.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Terminal = { data?: unknown; error?: unknown };

const writes: Array<{
  table: string;
  payload: Record<string, unknown>;
  eq: Array<[string, unknown]>;
}> = [];
let supabaseQueue: Terminal[] = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const terminal = supabaseQueue.shift() ?? { data: null, error: null };
    const filters: Array<[string, unknown]> = [];
    let payload: Record<string, unknown> | undefined;

    const chain: Record<string, unknown> = {};
    const pass = () => chain;
    chain.select = vi.fn(pass);
    chain.update = vi.fn((p: Record<string, unknown>) => {
      payload = p;
      return chain;
    });
    chain.eq = vi.fn((col: string, val: unknown) => {
      filters.push([col, val]);
      return chain;
    });
    chain.maybeSingle = vi.fn(async () => terminal);
    chain.single = vi.fn(async () => terminal);
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) => {
      if (payload) writes.push({ table, payload, eq: [...filters] });
      return Promise.resolve(terminal).then(resolve, reject);
    };
    return chain;
  }

  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

const redisStore = new Map<string, string>();
const redisDel = vi.fn(async (key: string) => {
  const had = redisStore.delete(key);
  return had ? 1 : 0;
});
const redisGet = vi.fn(async (key: string) => redisStore.get(key) ?? null);
const redisSet = vi.fn(async (key: string, value: string) => {
  redisStore.set(key, value);
  return 'OK';
});

vi.mock('@/lib/redis', () => ({
  redis: {
    get: (...args: unknown[]) => redisGet(...(args as [string])),
    set: (...args: unknown[]) => redisSet(...(args as [string, string])),
    del: (...args: unknown[]) => redisDel(...(args as [string])),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const constructEvent = vi.fn();
const retrieveSub = vi.fn();

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: { constructEvent },
    subscriptions: { retrieve: retrieveSub },
  }),
  getPriceId: () => 'price_test',
}));

import { POST } from '@/app/api/webhooks/stripe/route';

const ENV_KEYS = ['STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY'] as const;
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

function makeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_paid',
    object: 'subscription',
    status: 'active',
    customer: 'cus_payer',
    start_date: 1_700_000_000,
    items: { data: [{ current_period_end: 1_702_592_000 }] },
    metadata: { spaceId: 'space_1' },
    ...overrides,
  };
}

function makeEvent(type: string, object: Record<string, unknown>, id = 'evt_1') {
  return {
    id,
    type,
    data: { object },
  };
}

async function postWebhook(event: ReturnType<typeof makeEvent>) {
  constructEvent.mockReturnValue(event);
  const req = new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig_test' },
    body: '{}',
  });
  return POST(req);
}

beforeEach(() => {
  snapshotEnv();
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  delete process.env.RESEND_API_KEY;
  supabaseQueue = [];
  writes.length = 0;
  redisStore.clear();
  redisGet.mockClear();
  redisSet.mockClear();
  redisDel.mockClear();
  constructEvent.mockReset();
  retrieveSub.mockReset();
});

afterEach(() => {
  restoreEnv();
});

describe('POST /api/webhooks/stripe — signature + config', () => {
  it('rejects a missing stripe-signature header', async () => {
    const req = new NextRequest('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: '{}',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it('rejects an invalid signature', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('bad sig');
    });
    const req = new NextRequest('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'nope' },
      body: '{}',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(writes).toHaveLength(0);
  });
});

describe('POST /api/webhooks/stripe — Space entitlement', () => {
  it('subscription.updated persists stripeSubscriptionId so later revoke can find the row', async () => {
    supabaseQueue = [
      { data: { id: 'space_1', stripeCustomerId: 'cus_payer', trialUsedAt: null } },
      { data: null, error: null },
      { data: null }, // notify: no space row by subscription id — skip email
    ];

    const sub = makeSub();
    const res = await postWebhook(makeEvent('customer.subscription.updated', sub));
    expect(res.status).toBe(200);

    const spaceWrite = writes.find((w) => w.table === 'Space');
    expect(spaceWrite).toBeDefined();
    expect(spaceWrite?.payload.stripeSubscriptionId).toBe('sub_paid');
    expect(spaceWrite?.payload.stripeSubscriptionStatus).toBe('active');
    expect(spaceWrite?.eq).toContainEqual(['id', 'space_1']);
  });

  it('subscription.deleted revokes via metadata.spaceId even when the row never stored the subscription id', async () => {
    supabaseQueue = [
      { data: { id: 'space_1', stripeCustomerId: 'cus_payer', trialUsedAt: '2026-01-01T00:00:00Z' } },
      { data: null, error: null },
      { data: null },
    ];

    const sub = makeSub({ status: 'canceled' });
    const res = await postWebhook(makeEvent('customer.subscription.deleted', sub, 'evt_del'));
    expect(res.status).toBe(200);

    const spaceWrite = writes.find((w) => w.table === 'Space');
    expect(spaceWrite?.payload.stripeSubscriptionStatus).toBe('canceled');
    expect(spaceWrite?.eq).toContainEqual(['id', 'space_1']);
  });

  it('poisoned spaceId does not cancel a victim; payer row still revokes by subscription id', async () => {
    supabaseQueue = [
      // victim space — different customer
      { data: { id: 'space_victim', stripeCustomerId: 'cus_victim', trialUsedAt: null } },
      // fall-through update by stripeSubscriptionId
      { data: null, error: null },
      { data: null },
    ];

    const sub = makeSub({
      status: 'canceled',
      customer: 'cus_attacker',
      metadata: { spaceId: 'space_victim' },
    });
    const res = await postWebhook(makeEvent('customer.subscription.deleted', sub, 'evt_poison'));
    expect(res.status).toBe(200);

    expect(writes).toHaveLength(1);
    expect(writes[0].eq).toContainEqual(['stripeSubscriptionId', 'sub_paid']);
    expect(writes[0].eq.find(([col]) => col === 'id')).toBeUndefined();
    expect(writes[0].payload.stripeSubscriptionStatus).toBe('canceled');
  });

  it('expanded customer object does not false-positive a paying space as metadata poisoning', async () => {
    supabaseQueue = [
      { data: { id: 'space_1', stripeCustomerId: 'cus_payer', trialUsedAt: null } },
      { data: null, error: null },
      { data: null },
    ];

    const sub = makeSub({
      customer: { id: 'cus_payer', object: 'customer', deleted: false },
    });
    const res = await postWebhook(makeEvent('customer.subscription.updated', sub, 'evt_expand'));
    expect(res.status).toBe(200);

    const spaceWrite = writes.find((w) => w.table === 'Space');
    expect(spaceWrite?.payload.stripeSubscriptionStatus).toBe('active');
    expect(spaceWrite?.payload.stripeSubscriptionId).toBe('sub_paid');
    expect(spaceWrite?.eq).toContainEqual(['id', 'space_1']);
  });

  it('invoice.payment_succeeded writes stripeSubscriptionId when checkout.session.completed never landed', async () => {
    retrieveSub.mockResolvedValue(makeSub());
    supabaseQueue = [
      { data: { id: 'space_1', stripeCustomerId: null, trialUsedAt: null } },
      { data: null, error: null },
      { data: null },
    ];

    const invoice = {
      id: 'in_1',
      subscription: 'sub_paid',
    };
    const res = await postWebhook(makeEvent('invoice.payment_succeeded', invoice, 'evt_pay'));
    expect(res.status).toBe(200);

    const spaceWrite = writes.find((w) => w.table === 'Space');
    expect(spaceWrite?.payload.stripeSubscriptionId).toBe('sub_paid');
    expect(spaceWrite?.payload.stripeSubscriptionStatus).toBe('active');
    expect(spaceWrite?.payload.stripeCustomerId).toBe('cus_payer');
    expect(spaceWrite?.eq).toContainEqual(['id', 'space_1']);
  });
});

describe('POST /api/webhooks/stripe — Redis claim', () => {
  it('releases the claim when the handler throws so Stripe retries can grant access', async () => {
    retrieveSub.mockRejectedValue(new Error('stripe down'));
    const session = {
      id: 'cs_1',
      subscription: 'sub_paid',
      customer: 'cus_payer',
      metadata: { spaceId: 'space_1' },
    };

    const res = await postWebhook(makeEvent('checkout.session.completed', session, 'evt_retry'));
    expect(res.status).toBe(500);
    expect(redisDel).toHaveBeenCalledWith('stripe:event:evt_retry');
    expect(redisStore.has('stripe:event:evt_retry')).toBe(false);
  });

  it('releases the claim when a Space write fails', async () => {
    supabaseQueue = [
      { data: { id: 'space_1', stripeCustomerId: 'cus_payer', trialUsedAt: null } },
      { data: null, error: { message: 'db flap' } },
    ];

    const res = await postWebhook(
      makeEvent('customer.subscription.updated', makeSub(), 'evt_db'),
    );
    expect(res.status).toBe(500);
    expect(redisStore.has('stripe:event:evt_db')).toBe(false);
  });

  it('skips already-processed events without writing', async () => {
    redisStore.set('stripe:event:evt_dup', '1');
    const res = await postWebhook(makeEvent('customer.subscription.updated', makeSub(), 'evt_dup'));
    expect(res.status).toBe(200);
    expect(writes).toHaveLength(0);
    expect(retrieveSub).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhooks/stripe — Brokerage guard', () => {
  it('does not write a victim brokerage when customer ids mismatch', async () => {
    supabaseQueue = [
      { data: { id: 'brk_victim', stripeCustomerId: 'cus_victim' } },
    ];

    const sub = makeSub({
      metadata: { brokerageId: 'brk_victim', plan: 'enterprise' },
      customer: 'cus_attacker',
    });
    const res = await postWebhook(makeEvent('customer.subscription.updated', sub, 'evt_brk'));
    expect(res.status).toBe(200);
    expect(writes).toHaveLength(0);
  });
});
