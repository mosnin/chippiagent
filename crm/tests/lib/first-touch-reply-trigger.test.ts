import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const draftFirstTouchForLead = vi.fn();
const draftFirstTouchReplyForLead = vi.fn();

vi.mock('@/lib/agent/first-touch', () => ({
  draftFirstTouchForLead: (...args: unknown[]) => draftFirstTouchForLead(...args),
}));
vi.mock('@/lib/agent/first-touch-reply', () => ({
  draftFirstTouchReplyForLead: (...args: unknown[]) => draftFirstTouchReplyForLead(...args),
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
  draftFirstTouchReplyForLead.mockReset();
  draftFirstTouchReplyForLead.mockResolvedValue({
    action: 'drafted',
    draftId: 'd_reply',
    contactId: 'c1',
    channel: 'sms',
    status: 'pending',
    content: 'Hi Sam — Jordan here. Tue 11am still work for you?',
    windows: ['Tue 11am'],
    picked: 'Tue 11am',
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

describe('fireAgentTrigger first-touch reply', () => {
  it('drafts a pending booking SMS on inbound_message and never sends', async () => {
    vi.stubGlobal('fetch', kvFetch());
    const result = await fireAgentTrigger({
      spaceId: 's1',
      event: 'inbound_message',
      contactId: 'c1',
      content: 'Tue 11am works',
      channel: 'sms',
      sourceDraftId: 'd_first',
    });
    expect(draftFirstTouchForLead).not.toHaveBeenCalled();
    expect(draftFirstTouchReplyForLead).toHaveBeenCalledWith({
      spaceId: 's1',
      contactId: 'c1',
      replyText: 'Tue 11am works',
      sourceDraftId: 'd_first',
      channel: 'sms',
    });
    expect(result.firstTouchReply?.sent).toBe(false);
    expect(result.firstTouchReply?.status).toBe('pending');
    expect(result.firstTouchReply?.content?.trim().length).toBeGreaterThan(0);
    expect(result.queued).toBe(true);
  });

  it('fails if a lead reply produces no draft', async () => {
    vi.stubGlobal('fetch', kvFetch());
    const result = await fireAgentTrigger({
      spaceId: 's1',
      event: 'inbound_message',
      contactId: 'c1',
      content: 'yes',
      channel: 'sms',
    });
    expect(draftFirstTouchReplyForLead).toHaveBeenCalledTimes(1);
    expect(result.firstTouchReply).toBeTruthy();
    expect(result.firstTouchReply?.action).toBe('drafted');
    expect(result.firstTouchReply?.content?.trim().length).toBeGreaterThan(0);
    expect(result.firstTouchReply?.sent).toBe(false);
  });

  it('does not draft a first-touch reply on new_lead', async () => {
    vi.stubGlobal('fetch', kvFetch());
    await fireAgentTrigger({ spaceId: 's1', event: 'new_lead', contactId: 'c1' });
    expect(draftFirstTouchReplyForLead).not.toHaveBeenCalled();
  });

  it('still drafts when Redis is down — the text cannot wait on the queue', async () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    const result = await fireAgentTrigger({
      spaceId: 's1',
      event: 'inbound_message',
      contactId: 'c1',
      content: 'Tue 11am',
      channel: 'sms',
    });
    expect(draftFirstTouchReplyForLead).toHaveBeenCalled();
    expect(result.queued).toBe(false);
    expect(result.reason).toBe('redis_not_configured');
    expect(result.firstTouchReply?.status).toBe('pending');
    expect(result.firstTouchReply?.sent).toBe(false);
    expect(result.firstTouchReply?.content?.trim().length).toBeGreaterThan(0);
  });
});
