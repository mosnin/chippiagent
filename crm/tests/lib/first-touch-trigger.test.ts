import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const draftFirstTouchForLead = vi.fn();

vi.mock('@/lib/agent/first-touch', () => ({
  draftFirstTouchForLead: (...args: unknown[]) => draftFirstTouchForLead(...args),
}));
vi.mock('@/lib/agent/first-touch-reply', () => ({
  draftFirstTouchReplyForLead: vi.fn(),
}));
vi.mock('@/lib/agent/tour-follow-up', () => ({
  draftTourFollowUpForContact: vi.fn(),
}));

import { fireAgentTrigger } from '@/lib/agent/fire-trigger';

const OLD_ENV = { ...process.env };

beforeEach(() => {
  process.env = {
    ...OLD_ENV,
    KV_REST_API_URL: 'https://kv.example.com',
    KV_REST_API_TOKEN: 'kv-token',
    MODAL_WEBHOOK_URL: 'https://modal.example.com/webhook',
    AGENT_INTERNAL_SECRET: 'secret',
    AGENT_IMMEDIATE_EVENTS: 'all',
  };
  draftFirstTouchForLead.mockReset();
  draftFirstTouchForLead.mockResolvedValue({
    action: 'drafted',
    draftId: 'd1',
    contactId: 'c1',
    channel: 'sms',
    status: 'pending',
    content: 'Hey Sam, this is Jordan. I can do Tue 11am or Wed 4pm — which works?',
    windows: ['Tue 11am', 'Wed 4pm'],
    sent: false,
  });
});

afterEach(() => {
  process.env = { ...OLD_ENV };
  vi.unstubAllGlobals();
});

function kvFetch() {
  return vi.fn(async (url: string) => {
    if (url.includes('/incr/')) return new Response(JSON.stringify({ result: 1 }), { status: 200 });
    if (url.includes('/expire/')) return new Response('OK', { status: 200 });
    if (url.includes('/set/')) return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
    if (url.includes('/rpush/') || url.includes('/lpush/') || url.includes('/ltrim/')) {
      return new Response('OK', { status: 200 });
    }
    if (url.startsWith('https://modal.example.com')) return new Response('OK', { status: 200 });
    return new Response('not found', { status: 404 });
  });
}

describe('fireAgentTrigger first-touch', () => {
  it('drafts on new_lead and still wakes the autonomous run', async () => {
    vi.stubGlobal('fetch', kvFetch());
    const result = await fireAgentTrigger({ spaceId: 's1', event: 'new_lead', contactId: 'c1' });
    expect(draftFirstTouchForLead).toHaveBeenCalledWith({ spaceId: 's1', contactId: 'c1' });
    expect(result.firstTouch?.sent).toBe(false);
    expect(result.firstTouch?.status).toBe('pending');
    expect(result.firstTouch?.content?.trim().length).toBeGreaterThan(0);
    expect(result.queued).toBe(true);
    expect(result.firedImmediately).toBe(true);
  });

  it('drafts on application_submitted', async () => {
    vi.stubGlobal('fetch', kvFetch());
    await fireAgentTrigger({ spaceId: 's1', event: 'application_submitted', contactId: 'c1' });
    expect(draftFirstTouchForLead).toHaveBeenCalledTimes(1);
  });

  it('does not draft on non-inbound events', async () => {
    vi.stubGlobal('fetch', kvFetch());
    await fireAgentTrigger({ spaceId: 's1', event: 'tour_completed', contactId: 'c1' });
    expect(draftFirstTouchForLead).not.toHaveBeenCalled();
  });

  it('does not draft first-touch on inbound_message — that is the reply slice', async () => {
    vi.stubGlobal('fetch', kvFetch());
    await fireAgentTrigger({ spaceId: 's1', event: 'inbound_message', contactId: 'c1' });
    expect(draftFirstTouchForLead).not.toHaveBeenCalled();
  });

  it('still drafts when Redis is down — the text cannot wait on the queue', async () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    const result = await fireAgentTrigger({ spaceId: 's1', event: 'new_lead', contactId: 'c1' });
    expect(draftFirstTouchForLead).toHaveBeenCalled();
    expect(result.queued).toBe(false);
    expect(result.reason).toBe('redis_not_configured');
    expect(result.firstTouch?.status).toBe('pending');
    expect(result.firstTouch?.sent).toBe(false);
  });
});
