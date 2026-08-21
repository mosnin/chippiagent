/**
 * Contact-page SMS path: realtor approves a draft → sendDraft → Telnyx.
 * Fail closed. Destination must be E.164 — intake stores "(555) 123-4567".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/integrations/composio', () => ({
  composioConfigured: () => false,
  executeToolForEntity: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { sendDraft } from '@/lib/delivery';

const draft = { channel: 'sms' as const, subject: null, content: 'Still free Thursday?' };
const contact = { name: 'Jane', email: null, phone: '(555) 123-4567' };

describe('sendDraft SMS — E.164 + fail-closed', () => {
  const prevKey = process.env.TELNYX_API_KEY;
  const prevFrom = process.env.TELNYX_FROM_NUMBER;

  beforeEach(() => {
    process.env.TELNYX_API_KEY = 'test-key';
    process.env.TELNYX_FROM_NUMBER = '+15555550100';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: { id: 'msg_1' } }), { status: 200 })),
    );
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.TELNYX_API_KEY;
    else process.env.TELNYX_API_KEY = prevKey;
    if (prevFrom === undefined) delete process.env.TELNYX_FROM_NUMBER;
    else process.env.TELNYX_FROM_NUMBER = prevFrom;
    vi.unstubAllGlobals();
  });

  it('sends the intake-formatted phone as E.164', async () => {
    const result = await sendDraft(draft, contact, 'Acme');
    expect(result).toEqual({ sent: true, method: 'sms' });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      from: '+15555550100',
      to: '+15551234567',
      text: 'Still free Thursday?',
    });
  });

  it('fails closed when Telnyx credentials are missing', async () => {
    delete process.env.TELNYX_API_KEY;
    delete process.env.TELNYX_FROM_NUMBER;
    const result = await sendDraft(draft, contact, 'Acme');
    expect(result).toEqual({ sent: false, method: 'sms', error: 'not_configured' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed when the contact has no phone', async () => {
    const result = await sendDraft(draft, { ...contact, phone: null }, 'Acme');
    expect(result.sent).toBe(false);
    expect(result.error).toMatch(/no phone/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed when the phone cannot be normalized to E.164', async () => {
    const result = await sendDraft(draft, { ...contact, phone: '123' }, 'Acme');
    expect(result).toEqual({
      sent: false,
      method: 'sms',
      error: 'Phone number is not valid E.164',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed on a premium-rate destination', async () => {
    const result = await sendDraft(draft, { ...contact, phone: '+19005551212' }, 'Acme');
    expect(result).toEqual({ sent: false, method: 'sms', error: 'Blocked destination' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed when Telnyx rejects the send', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ errors: [{ detail: 'Invalid destination' }] }), { status: 400 }),
      ),
    );
    const result = await sendDraft(draft, contact, 'Acme');
    expect(result.sent).toBe(false);
    expect(result.method).toBe('sms');
    expect(result.error).toBe('Invalid destination');
  });
});
