import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn(async () => ({ userId: 'u_1' })) }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: vi.fn(async () => ({ id: 'space_1' })) }));

describe('GET /api/agent/trigger/events/summary', () => {
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

  it('returns status counts and computed rates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      result: [
        JSON.stringify({ status: 'queued' }),
        JSON.stringify({ status: 'queued_modal' }),
        JSON.stringify({ status: 'queued_modal' }),
        JSON.stringify({ status: 'deduped' }),
      ],
    }), { status: 200 })) as unknown as typeof fetch);

    const { GET } = await import('@/app/api/agent/trigger/events/summary/route');
    const res = await GET(new Request('http://localhost/api/agent/trigger/events/summary?limit=100&dedupeWarnThreshold=0.7&modalWarnThreshold=0.1', { headers: { 'x-agent-ops-secret': 'test-ops-secret' } }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(4);
    expect(body.byStatus).toEqual({ deduped: 1, queued: 1, queued_modal: 2, replayed: 0 });
    expect(body.rates.dedupeRate).toBe(0.25);
    expect(body.rates.modalRate).toBe(0.5);
    expect(body.health).toBe('ok');
    expect(body.windowSize).toBe(100);
  });
});
