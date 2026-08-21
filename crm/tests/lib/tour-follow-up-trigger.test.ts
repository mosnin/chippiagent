import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const draftFirstTouchForLead = vi.fn();
const draftFirstTouchReplyForLead = vi.fn();
const draftTourFollowUpForContact = vi.fn();

vi.mock('@/lib/agent/first-touch', () => ({
  draftFirstTouchForLead: (...args: unknown[]) => draftFirstTouchForLead(...args),
}));
vi.mock('@/lib/agent/first-touch-reply', () => ({
  draftFirstTouchReplyForLead: (...args: unknown[]) => draftFirstTouchReplyForLead(...args),
}));
vi.mock('@/lib/agent/tour-follow-up', () => ({
  draftTourFollowUpForContact: (...args: unknown[]) => draftTourFollowUpForContact(...args),
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
  draftTourFollowUpForContact.mockReset();
  draftTourFollowUpForContact.mockResolvedValue({
    action: 'drafted',
    draftId: 'd_tour',
    contactId: 'c1',
    channel: 'sms',
    status: 'pending',
    content: 'Hi Sam — Jordan here. Thoughts on 1422 Pine? Ready to talk next?',
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

describe('fireAgentTrigger tour-follow-up', () => {
  it('drafts a pending follow-up SMS on tour_completed and never sends', async () => {
    vi.stubGlobal('fetch', kvFetch());
    const result = await fireAgentTrigger({
      spaceId: 's1',
      event: 'tour_completed',
      contactId: 'c1',
      tourId: 't1',
    });
    expect(draftFirstTouchForLead).not.toHaveBeenCalled();
    expect(draftFirstTouchReplyForLead).not.toHaveBeenCalled();
    expect(draftTourFollowUpForContact).toHaveBeenCalledWith({
      spaceId: 's1',
      contactId: 'c1',
      tourId: 't1',
    });
    expect(result.tourFollowUp?.sent).toBe(false);
    expect(result.tourFollowUp?.status).toBe('pending');
    expect(result.tourFollowUp?.content?.trim().length).toBeGreaterThan(0);
    expect(result.tourFollowUp?.content).not.toMatch(/\b(sent|live|booked|reserved|locked|held)\b/i);
    expect(result.queued).toBe(true);
  });

  it('does not draft a tour follow-up on new_lead or inbound_message', async () => {
    vi.stubGlobal('fetch', kvFetch());
    await fireAgentTrigger({ spaceId: 's1', event: 'new_lead', contactId: 'c1' });
    await fireAgentTrigger({
      spaceId: 's1',
      event: 'inbound_message',
      contactId: 'c1',
      channel: 'sms',
    });
    expect(draftTourFollowUpForContact).not.toHaveBeenCalled();
  });

  it('does not draft deal_stage_changed or goal_completed in this slice', async () => {
    vi.stubGlobal('fetch', kvFetch());
    await fireAgentTrigger({ spaceId: 's1', event: 'deal_stage_changed', contactId: 'c1' });
    await fireAgentTrigger({ spaceId: 's1', event: 'goal_completed', contactId: 'c1' });
    expect(draftTourFollowUpForContact).not.toHaveBeenCalled();
  });

  it('still drafts when Redis is down — the text cannot wait on the queue', async () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    const result = await fireAgentTrigger({
      spaceId: 's1',
      event: 'tour_completed',
      contactId: 'c1',
      tourId: 't1',
    });
    expect(draftTourFollowUpForContact).toHaveBeenCalled();
    expect(result.queued).toBe(false);
    expect(result.reason).toBe('redis_not_configured');
    expect(result.tourFollowUp?.status).toBe('pending');
    expect(result.tourFollowUp?.sent).toBe(false);
    expect(result.tourFollowUp?.content?.trim().length).toBeGreaterThan(0);
  });
});
