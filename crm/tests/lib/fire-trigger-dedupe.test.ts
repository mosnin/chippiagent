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

import { fireAgentTrigger, makeTriggerDedupeKey } from '@/lib/agent/fire-trigger';

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
  draftFirstTouchForLead.mockResolvedValue({ action: 'sent', sent: true, status: 'sent', contactId: 'c1' });
  draftFirstTouchReplyForLead.mockResolvedValue({
    action: 'sent',
    sent: true,
    status: 'sent',
    contactId: 'c1',
  });
  draftTourFollowUpForContact.mockResolvedValue({
    action: 'sent',
    sent: true,
    status: 'sent',
    contactId: 'c1',
  });
});

afterEach(() => {
  process.env = { ...OLD_ENV };
  vi.unstubAllGlobals();
});

function kvFetch(opts?: { setResults?: Array<string | null>; rpushOk?: boolean }) {
  const setResults = [...(opts?.setResults ?? ['OK'])];
  const rpushOk = opts?.rpushOk ?? true;
  return vi.fn(async (url: string) => {
    if (url.includes('/incr/')) return new Response(JSON.stringify({ result: 1 }), { status: 200 });
    if (url.includes('/expire/')) return new Response('OK', { status: 200 });
    if (url.includes('/set/')) {
      const result = setResults.length > 0 ? setResults.shift() : null;
      return new Response(JSON.stringify({ result }), { status: 200 });
    }
    if (url.includes('/rpush/')) {
      return new Response(rpushOk ? 'OK' : 'fail', { status: rpushOk ? 200 : 500 });
    }
    if (url.includes('/del/') || url.includes('/lpush/') || url.includes('/ltrim/')) {
      return new Response('OK', { status: 200 });
    }
    if (url.startsWith('https://modal.example.com')) return new Response('OK', { status: 200 });
    return new Response('not found', { status: 404 });
  });
}

describe('makeTriggerDedupeKey', () => {
  it('keeps distinct tours for the same contact as distinct events', () => {
    const a = makeTriggerDedupeKey({
      spaceId: 's1',
      event: 'tour_completed',
      contactId: 'c1',
      tourId: 't1',
    });
    const b = makeTriggerDedupeKey({
      spaceId: 's1',
      event: 'tour_completed',
      contactId: 'c1',
      tourId: 't2',
    });
    expect(a).not.toBe(b);
  });

  it('keeps distinct inbound texts as distinct events', () => {
    const a = makeTriggerDedupeKey({
      spaceId: 's1',
      event: 'inbound_message',
      contactId: 'c1',
      channel: 'sms',
      content: 'Tue 11am',
    });
    const b = makeTriggerDedupeKey({
      spaceId: 's1',
      event: 'inbound_message',
      contactId: 'c1',
      channel: 'sms',
      content: 'Wed 4pm instead',
    });
    expect(a).not.toBe(b);
  });

  it('does not put the raw SMS body in the Redis key', () => {
    const key = makeTriggerDedupeKey({
      spaceId: 's1',
      event: 'inbound_message',
      contactId: 'c1',
      content: 'Tue 11am works for me',
    });
    expect(key).not.toContain('Tue 11am works for me');
  });

  it('collapses an identical retry of the same payload', () => {
    const input = {
      spaceId: 's1' as const,
      event: 'new_lead' as const,
      contactId: 'c1',
    };
    expect(makeTriggerDedupeKey(input)).toBe(makeTriggerDedupeKey(input));
  });
});

describe('fireAgentTrigger dedupe', () => {
  it('does not send a second SMS for a Redis-duplicate retry', async () => {
    const fetchMock = kvFetch({ setResults: ['OK', null] });
    vi.stubGlobal('fetch', fetchMock);

    const first = await fireAgentTrigger({ spaceId: 's1', event: 'new_lead', contactId: 'c1' });
    const second = await fireAgentTrigger({ spaceId: 's1', event: 'new_lead', contactId: 'c1' });

    expect(first.deduped ?? false).toBe(false);
    expect(first.firstTouch?.sent).toBe(true);
    expect(second.deduped).toBe(true);
    expect(second.firstTouch).toBeUndefined();
    expect(draftFirstTouchForLead).toHaveBeenCalledTimes(1);
  });

  it('queues two unique inbound messages instead of dropping the second', async () => {
    const fetchMock = kvFetch({ setResults: ['OK', 'OK'] });
    vi.stubGlobal('fetch', fetchMock);

    const first = await fireAgentTrigger({
      spaceId: 's1',
      event: 'inbound_message',
      contactId: 'c1',
      channel: 'sms',
      content: 'Tue 11am',
    });
    const second = await fireAgentTrigger({
      spaceId: 's1',
      event: 'inbound_message',
      contactId: 'c1',
      channel: 'sms',
      content: 'actually Wed',
    });

    expect(first.deduped ?? false).toBe(false);
    expect(second.deduped ?? false).toBe(false);
    expect(first.queued).toBe(true);
    expect(second.queued).toBe(true);
    expect(draftFirstTouchReplyForLead).toHaveBeenCalledTimes(2);

    const rpushCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/rpush/'));
    expect(rpushCalls).toHaveLength(2);
    const setUrls = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes('agent%3Atrigger-dedupe'));
    expect(setUrls[0]).not.toBe(setUrls[1]);
  });

  it('queues two unique tour_completed events for different tourIds', async () => {
    const fetchMock = kvFetch({ setResults: ['OK', 'OK'] });
    vi.stubGlobal('fetch', fetchMock);

    const first = await fireAgentTrigger({
      spaceId: 's1',
      event: 'tour_completed',
      contactId: 'c1',
      tourId: 't1',
    });
    const second = await fireAgentTrigger({
      spaceId: 's1',
      event: 'tour_completed',
      contactId: 'c1',
      tourId: 't2',
    });

    expect(first.queued).toBe(true);
    expect(second.queued).toBe(true);
    expect(second.deduped ?? false).toBe(false);
    expect(draftTourFollowUpForContact).toHaveBeenCalledTimes(2);
  });

  it('releases the dedupe claim when enqueue fails so a retry is not dropped', async () => {
    const fetchMock = kvFetch({ setResults: ['OK'], rpushOk: false });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fireAgentTrigger({ spaceId: 's1', event: 'new_lead', contactId: 'c1' });
    expect(result.queued).toBe(false);
    expect(result.reason).toBe('redis_push_failed');

    const del = fetchMock.mock.calls.find(([url]) => String(url).includes('/del/agent%3Atrigger-dedupe'));
    expect(del).toBeTruthy();
  });
});
