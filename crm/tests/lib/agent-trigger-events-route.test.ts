import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn(async () => ({ userId: 'u_1' })) }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: vi.fn(async () => ({ id: 'space_1' })) }));

describe('GET /api/agent/trigger/events', () => {
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

  it('returns parsed recent trigger events with pagination params', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      result: [
        JSON.stringify({ event: 'new_lead', contactId: 'c1', dealId: null, status: 'queued', at: '2026-05-03T00:00:00Z' }),
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { GET } = await import('@/app/api/agent/trigger/events/route');
    const res = await GET(new Request('http://localhost/api/agent/trigger/events?limit=10&offset=20', { headers: { 'x-agent-ops-secret': 'test-ops-secret' } }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.count).toBe(1);
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(20);
    expect(body.events[0].event).toBe('new_lead');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://kv.example.com/lrange/agent%3Atrigger%3Aevents%3Aspace_1/20/29',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('filters by status when requested', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      result: [
        JSON.stringify({ event: 'new_lead', contactId: null, dealId: null, status: 'queued', at: '2026-05-03T00:00:00Z' }),
        JSON.stringify({ event: 'new_lead', contactId: null, dealId: null, status: 'deduped', at: '2026-05-03T00:00:01Z' }),
      ],
    }), { status: 200 })) as unknown as typeof fetch);

    const { GET } = await import('@/app/api/agent/trigger/events/route');
    const res = await GET(new Request('http://localhost/api/agent/trigger/events?status=deduped', { headers: { 'x-agent-ops-secret': 'test-ops-secret' } }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('deduped');
    expect(body.count).toBe(1);
    expect(body.events[0].status).toBe('deduped');
  });
});


describe('DELETE /api/agent/trigger/events', () => {
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

  it('clears trigger event log for current space', async () => {
    const fetchMock = vi.fn(async () => new Response('OK', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { DELETE } = await import('@/app/api/agent/trigger/events/route');
    const req = new Request('http://localhost/api/agent/trigger/events', { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'x-agent-ops-secret': 'test-ops-secret' }, body: JSON.stringify({ reason: 'cleanup after incident' }) });
    const res = await DELETE(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cleared).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://kv.example.com/del/agent%3Atrigger%3Aevents%3Aspace_1',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
