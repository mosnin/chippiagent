import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn(async () => ({ userId: 'u_1' })) }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: vi.fn(async () => ({ id: 'space_1' })) }));

describe('agent trigger ops route', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...OLD_ENV,
      AGENT_TRIGGER_OPS_ENABLED: 'true',
      AGENT_TRIGGER_OPS_SECRET: 'test-ops-secret',
      KV_REST_API_URL: 'https://kv.example.com',
      KV_REST_API_TOKEN: 'kv-token',
    };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it('accepts ops secret via header when configured', async () => {
    process.env.AGENT_TRIGGER_OPS_SECRET = 'super-secret';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ result: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { GET } = await import('@/app/api/agent/trigger/ops/route');
    const req = new Request('http://localhost/api/agent/trigger/ops', {
      headers: { 'x-agent-ops-secret': 'super-secret' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it('returns paginated operations audit rows', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      result: [JSON.stringify({ action: 'replay_event', userId: 'u_1', detail: { offset: 1 }, at: '2026-05-03T00:00:00Z' })],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { GET } = await import('@/app/api/agent/trigger/ops/route');
    const res = await GET(new Request('http://localhost/api/agent/trigger/ops?limit=10&offset=5', { headers: { 'x-agent-ops-secret': 'test-ops-secret' } }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.count).toBe(1);
    expect(body.rows[0].action).toBe('replay_event');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://kv.example.com/lrange/agent%3Atrigger%3Aops%3Aspace_1/5/14',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('filters operations audit rows by action', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      result: [
        JSON.stringify({ action: 'clear_events', userId: 'u_1', detail: null, at: '2026-05-03T00:00:00Z' }),
        JSON.stringify({ action: 'replay_event', userId: 'u_1', detail: { offset: 1 }, at: '2026-05-03T00:01:00Z' }),
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { GET } = await import('@/app/api/agent/trigger/ops/route');
    const res = await GET(new Request('http://localhost/api/agent/trigger/ops?action=replay_event', { headers: { 'x-agent-ops-secret': 'test-ops-secret' } }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.count).toBe(1);
    expect(body.action).toBe('replay_event');
    expect(body.rows[0].action).toBe('replay_event');
  });

  it('clears operations audit rows', async () => {
    const fetchMock = vi.fn(async () => new Response('OK', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { DELETE } = await import('@/app/api/agent/trigger/ops/route');
    const res = await DELETE(new Request('http://localhost/test', { method: 'DELETE', headers: { 'x-agent-ops-secret': 'test-ops-secret' } }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cleared).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://kv.example.com/del/agent%3Atrigger%3Aops%3Aspace_1',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
