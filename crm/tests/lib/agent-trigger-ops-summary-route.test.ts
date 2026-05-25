import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn(async () => ({ userId: 'u_1' })) }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: vi.fn(async () => ({ id: 'space_1' })) }));

describe('GET /api/agent/trigger/ops/summary', () => {
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

  it('returns action counts from recent ops audit rows', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      result: [
        JSON.stringify({ action: 'replay_event' }),
        JSON.stringify({ action: 'clear_events' }),
        JSON.stringify({ action: 'replay_event' }),
      ],
    }), { status: 200 })) as unknown as typeof fetch);

    const { GET } = await import('@/app/api/agent/trigger/ops/summary/route');
    const res = await GET(new Request('http://localhost/api/agent/trigger/ops/summary?limit=100', { headers: { 'x-agent-ops-secret': 'test-ops-secret' } }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(3);
    expect(body.byAction).toEqual({ clear_events: 1, replay_event: 2 });
    expect(body.windowSize).toBe(100);
  });
});
