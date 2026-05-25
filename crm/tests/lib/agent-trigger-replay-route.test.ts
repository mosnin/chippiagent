import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn(async () => ({ userId: 'u_1' })) }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: vi.fn(async () => ({ id: 'space_1' })) }));

describe('POST /api/agent/trigger/replay', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...OLD_ENV,
      AGENT_TRIGGER_OPS_SECRET: 'test-ops-secret',
      KV_REST_API_URL: 'https://kv.example.com',
      KV_REST_API_TOKEN: 'kv-token',
    };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it('returns 403 when ops secret is configured but missing', async () => {
    process.env.AGENT_TRIGGER_OPS_SECRET = 'shh';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('OK', { status: 200 })) as unknown as typeof fetch);

    const { POST } = await import('@/app/api/agent/trigger/replay/route');
    const req = new Request('http://localhost/api/agent/trigger/replay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offset: 0 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('replays an event from log offset back into trigger queue', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/incr/')) return new Response(JSON.stringify({ result: 1 }), { status: 200 });
      if (url.includes('/expire/')) return new Response('OK', { status: 200 });
      if (url.includes('/lrange/')) {
        return new Response(JSON.stringify({
          result: [JSON.stringify({ event: 'new_lead', contactId: 'c1', dealId: null, at: '2026-05-03T00:00:00Z' })],
        }), { status: 200 });
      }
      if (url.includes('/rpush/')) return new Response('OK', { status: 200 });
      if (url.includes('/lpush/')) return new Response('OK', { status: 200 });
      if (url.includes('/ltrim/')) return new Response('OK', { status: 200 });
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { POST } = await import('@/app/api/agent/trigger/replay/route');
    const req = new Request('http://localhost/api/agent/trigger/replay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-agent-ops-secret': 'test-ops-secret' },
      body: JSON.stringify({ offset: 0, reason: 'rerun missed trigger' }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.replayed).toBe(true);
    expect(body.event).toBe('new_lead');
  });

  it('returns 400 for invalid offset input', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not called', { status: 500 })) as unknown as typeof fetch);

    const { POST } = await import('@/app/api/agent/trigger/replay/route');
    const req = new Request('http://localhost/api/agent/trigger/replay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-agent-ops-secret': 'test-ops-secret' },
      body: JSON.stringify({ offset: -1 }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.reason).toContain('offset must be a non-negative integer');
  });

  it('rejects duplicate replay requests with same idempotency key', async () => {
    let idem = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('agent%3Atrigger-replay-idem')) {
        idem += 1;
        return new Response(JSON.stringify({ result: idem }), { status: 200 });
      }
      if (url.includes('/expire/')) return new Response('OK', { status: 200 });
      if (url.includes('/incr/')) return new Response(JSON.stringify({ result: 1 }), { status: 200 });
      if (url.includes('/lrange/')) {
        return new Response(JSON.stringify({
          result: [JSON.stringify({ event: 'new_lead', contactId: 'c1', dealId: null, at: '2026-05-03T00:00:00Z' })],
        }), { status: 200 });
      }
      if (url.includes('/rpush/')) return new Response('OK', { status: 200 });
      if (url.includes('/lpush/')) return new Response('OK', { status: 200 });
      if (url.includes('/ltrim/')) return new Response('OK', { status: 200 });
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { POST } = await import('@/app/api/agent/trigger/replay/route');
    const req1 = new Request('http://localhost/api/agent/trigger/replay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-agent-ops-secret': 'test-ops-secret' },
      body: JSON.stringify({ offset: 0, idempotencyKey: 'abc-123' }),
    });
    const req2 = new Request('http://localhost/api/agent/trigger/replay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-agent-ops-secret': 'test-ops-secret' },
      body: JSON.stringify({ offset: 0, idempotencyKey: 'abc-123' }),
    });

    const first = await POST(req1);
    const second = await POST(req2);
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
  });

  it('rejects replaying replayed entries by default', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/incr/')) return new Response(JSON.stringify({ result: 1 }), { status: 200 });
      if (url.includes('/expire/')) return new Response('OK', { status: 200 });
      if (url.includes('/lrange/')) {
        return new Response(JSON.stringify({
          result: [JSON.stringify({ event: 'new_lead', contactId: 'c1', dealId: null, at: '2026-05-03T00:00:00Z', status: 'replayed' })],
        }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { POST } = await import('@/app/api/agent/trigger/replay/route');
    const req = new Request('http://localhost/api/agent/trigger/replay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-agent-ops-secret': 'test-ops-secret' },
      body: JSON.stringify({ offset: 0 }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.replayed).toBe(false);
  });
});
