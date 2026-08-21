/**
 * Route-level tests for POST /api/agent/inbound.
 *
 * The inbound webhook is the path that records a lead reply and fires
 * inbound_message — which is what sends the first-touch reply SMS.
 * A contact-lookup DB error must 500 (retry) not 404 (drop).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Terminal = { data?: unknown; error?: unknown };
let supabaseQueue: Terminal[] = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(): Record<string, unknown> {
    const terminal = supabaseQueue.shift() ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'insert', 'update']) {
      chain[method] = vi.fn(() => chain);
    }
    chain.maybeSingle = vi.fn(() => Promise.resolve(terminal));
    chain.then = (
      resolve: (v: Terminal) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(terminal).then(resolve, reject);
    return chain;
  }
  return {
    supabase: {
      from: vi.fn(() => makeChain()),
    },
  };
});

const fireAgentTrigger = vi.fn();
vi.mock('@/lib/agent/fire-trigger', () => ({
  fireAgentTrigger: (...args: unknown[]) => fireAgentTrigger(...args),
}));

const ORIGINAL_SECRET = process.env.AGENT_INTERNAL_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  supabaseQueue = [];
  fireAgentTrigger.mockResolvedValue({ queued: true });
  process.env.AGENT_INTERNAL_SECRET = 'inbound-secret';
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.AGENT_INTERNAL_SECRET;
  else process.env.AGENT_INTERNAL_SECRET = ORIGINAL_SECRET;
});

async function loadPost() {
  const { POST } = await import('@/app/api/agent/inbound/route');
  return POST;
}

function makeRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = { authorization: 'Bearer inbound-secret' },
): NextRequest {
  return new NextRequest('http://localhost/api/agent/inbound', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  contactId: 'c1',
  spaceId: 's1',
  channel: 'sms',
  content: 'Tue 11am works',
};

describe('POST /api/agent/inbound', () => {
  it('returns 401 without the internal secret', async () => {
    const POST = await loadPost();
    const res = await POST(makeRequest(VALID_BODY, {}));
    expect(res.status).toBe(401);
    expect(fireAgentTrigger).not.toHaveBeenCalled();
  });

  it('returns 500 (not 404) when contact lookup errors so the webhook retries', async () => {
    supabaseQueue.push({ data: null, error: { message: 'connection reset' } });
    const POST = await loadPost();
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Contact lookup failed');
    expect(fireAgentTrigger).not.toHaveBeenCalled();
  });

  it('returns 404 when the contact is missing from the space', async () => {
    supabaseQueue.push({ data: null, error: null });
    const POST = await loadPost();
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(404);
    expect(fireAgentTrigger).not.toHaveBeenCalled();
  });

  it('records the inbound and fires inbound_message on the happy path', async () => {
    supabaseQueue.push({ data: { id: 'c1', name: 'Sam', leadScore: 80 }, error: null });
    supabaseQueue.push({ error: null });
    supabaseQueue.push({ error: null });
    const POST = await loadPost();
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recorded).toBe(true);
    expect(fireAgentTrigger).toHaveBeenCalledWith({
      spaceId: 's1',
      event: 'inbound_message',
      contactId: 'c1',
      content: 'Tue 11am works',
      channel: 'sms',
      sourceDraftId: undefined,
    });
  });
});
