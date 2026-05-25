import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn(async () => ({ userId: 'u_1' })) }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: vi.fn(async () => ({ id: 'space_1' })) }));

describe('GET /api/agent/trigger/config', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...OLD_ENV,
      AGENT_TRIGGER_OPS_SECRET: 'test-ops-secret',
      AGENT_IMMEDIATE_EVENTS: 'tour_completed,new_lead',
      AGENT_TRIGGER_DEDUPE_WINDOW_S: '180',
      MODAL_WEBHOOK_URL: 'https://modal.example.com/webhook',
      AGENT_INTERNAL_SECRET: 'secret',
      KV_REST_API_URL: 'https://kv.example.com',
      KV_REST_API_TOKEN: 'kv-token',
    };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it('requires ops secret when configured', async () => {
    process.env.AGENT_TRIGGER_OPS_SECRET = 'shh';

    const { GET } = await import('@/app/api/agent/trigger/config/route');
    const res = await GET(new Request('http://localhost/api/agent/trigger/config'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when trigger ops endpoints are disabled', async () => {
    process.env.AGENT_TRIGGER_OPS_ENABLED = 'false';

    const { GET } = await import('@/app/api/agent/trigger/config/route');
    const res = await GET(new Request('http://localhost/test'));
    expect(res.status).toBe(404);
  });

  it('returns effective trigger runtime configuration for current space', async () => {
    const { GET } = await import('@/app/api/agent/trigger/config/route');
    const res = await GET(new Request('http://localhost/test', { headers: { 'x-agent-ops-secret': 'test-ops-secret' } }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.spaceId).toBe('space_1');
    expect(body.config.immediateEvents).toEqual(['new_lead', 'tour_completed']);
    expect(body.config.dedupeWindowSeconds).toBe(180);
    expect(body.config.hasModalWebhook).toBe(true);
    expect(body.config.hasRedis).toBe(true);
  });
});
