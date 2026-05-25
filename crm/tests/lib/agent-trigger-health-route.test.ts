import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn(async () => ({ userId: 'u_1' })) }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: vi.fn(async () => ({ id: 'space_1' })) }));

describe('GET /api/agent/trigger/health', () => {
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

  it('returns computed health snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      result: [
        JSON.stringify({ status: 'queued_modal' }),
        JSON.stringify({ status: 'queued_modal' }),
        JSON.stringify({ status: 'deduped' }),
      ],
    }), { status: 200 })) as unknown as typeof fetch);

    const { GET } = await import('@/app/api/agent/trigger/health/route');
    const res = await GET(new Request('http://localhost/test', { headers: { 'x-agent-ops-secret': 'test-ops-secret' } }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(3);
    expect(body.health).toBe('ok');
  });
});
