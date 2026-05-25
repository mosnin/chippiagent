import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn(async () => ({ userId: 'u_1' })) }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: vi.fn(async () => ({ id: 'space_1' })) }));

describe('POST /api/agent/trigger', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...OLD_ENV,
      KV_REST_API_URL: 'https://kv.example.com',
      KV_REST_API_TOKEN: 'kv-token',
      MODAL_WEBHOOK_URL: 'https://modal.example.com/webhook',
      AGENT_INTERNAL_SECRET: 'secret',
    };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  async function call(event: string, bodyExtra: Record<string, unknown> = {}, fetchMock?: ReturnType<typeof vi.fn>) {
    if (fetchMock) vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    const { POST } = await import('@/app/api/agent/trigger/route');
    const req = new Request('http://localhost/api/agent/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...bodyExtra }),
    });
    const res = await POST(req as never);
    return { res, body: await res.json() };
  }

  it('queues to redis and fires modal when event is configured immediate', async () => {
    process.env.AGENT_IMMEDIATE_EVENTS = 'tour_completed';
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/incr/')) return new Response(JSON.stringify({ result: 1 }), { status: 200 });
      if (url.includes('/expire/')) return new Response('OK', { status: 200 });
      if (url.includes('/rpush/')) return new Response('OK', { status: 200 });
      if (url.startsWith('https://modal.example.com')) return new Response('OK', { status: 200 });
      return new Response('not found', { status: 404 });
    });

    const out = await call('tour_completed', {}, fetchMock);
    expect(out.res.status).toBe(200);
    expect(out.body.firedImmediately).toBe(true);
  });

  it('queues to redis but does not fire modal for non-immediate event subset', async () => {
    process.env.AGENT_IMMEDIATE_EVENTS = 'tour_completed';
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/incr/')) return new Response(JSON.stringify({ result: 1 }), { status: 200 });
      if (url.includes('/expire/')) return new Response('OK', { status: 200 });
      if (url.includes('/rpush/')) return new Response('OK', { status: 200 });
      if (url.startsWith('https://modal.example.com')) return new Response('OK', { status: 200 });
      return new Response('not found', { status: 404 });
    });

    const out = await call('new_lead', {}, fetchMock);
    expect(out.res.status).toBe(200);
    expect(out.body.firedImmediately).toBe(false);
  });

  it('fails safe to immediate fire on invalid policy value', async () => {
    process.env.AGENT_IMMEDIATE_EVENTS = 'bogus_event';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/incr/')) return new Response(JSON.stringify({ result: 1 }), { status: 200 });
      if (url.includes('/expire/')) return new Response('OK', { status: 200 });
      if (url.includes('/rpush/')) return new Response('OK', { status: 200 });
      if (url.startsWith('https://modal.example.com')) return new Response('OK', { status: 200 });
      return new Response('not found', { status: 404 });
    });

    const out = await call('new_lead', {}, fetchMock);
    expect(out.res.status).toBe(200);
    expect(out.body.firedImmediately).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('dedupes repeated trigger payloads inside dedupe window', async () => {
    process.env.AGENT_IMMEDIATE_EVENTS = 'all';
    let dedupeCount = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('agent%3Atrigger-dedupe')) {
        dedupeCount += 1;
        // SET NX: 'OK' when the key was absent (first call), null when it
        // already existed (a duplicate within the window).
        return new Response(
          JSON.stringify({ result: dedupeCount === 1 ? 'OK' : null }),
          { status: 200 },
        );
      }
      if (url.includes('/incr/')) return new Response(JSON.stringify({ result: 1 }), { status: 200 });
      if (url.includes('/expire/')) return new Response('OK', { status: 200 });
      if (url.includes('/rpush/')) return new Response('OK', { status: 200 });
      if (url.startsWith('https://modal.example.com')) return new Response('OK', { status: 200 });
      return new Response('not found', { status: 404 });
    });

    const first = await call('new_lead', { contactId: 'c1' }, fetchMock);
    const second = await call('new_lead', { contactId: 'c1' }, fetchMock);

    expect(first.body.deduped ?? false).toBe(false);
    expect(second.body.deduped).toBe(true);
    expect(second.body.firedImmediately).toBe(false);
  });
});
