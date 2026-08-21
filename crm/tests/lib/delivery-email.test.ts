import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeToolForEntityMock = vi.hoisted(() => vi.fn());
const composioConfiguredMock = vi.hoisted(() => vi.fn(() => true));
const resendSendMock = vi.hoisted(() => vi.fn());

let inboxRows: Array<{ toolkit: string }> = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      const pass = () => chain;
      chain.select = vi.fn(pass);
      chain.eq = vi.fn(pass);
      chain.in = vi.fn(() => Promise.resolve({ data: inboxRows, error: null }));
      return chain;
    }),
  },
}));

vi.mock('@/lib/integrations/composio', () => ({
  composioConfigured: composioConfiguredMock,
  executeToolForEntity: executeToolForEntityMock,
}));

vi.mock('resend', () => ({
  Resend: class Resend {
    emails = { send: resendSendMock };
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { sendDraft } from '@/lib/delivery';

const draft = { channel: 'email' as const, subject: 'Tour Friday', content: 'See you at 2.' };
const contact = { name: 'Jane', email: 'jane@example.com', phone: null };

describe('sendDraft email', () => {
  beforeEach(() => {
    inboxRows = [];
    executeToolForEntityMock.mockReset();
    composioConfiguredMock.mockReturnValue(true);
    resendSendMock.mockReset();
    vi.unstubAllEnvs();
  });

  it('does not mark inbox send as delivered when successful is missing', async () => {
    inboxRows = [{ toolkit: 'gmail' }];
    executeToolForEntityMock.mockResolvedValueOnce({ error: null });

    const result = await sendDraft(draft, contact, 'Jane Realty', {
      spaceId: 'space_1',
      userId: 'user_1',
    });

    expect(result.sent).toBe(false);
    expect(result.method).toBe('gmail');
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('does not mark inbox send as delivered when successful is false', async () => {
    inboxRows = [{ toolkit: 'gmail' }];
    executeToolForEntityMock.mockResolvedValueOnce({
      successful: false,
      error: 'quota',
    });

    const result = await sendDraft(draft, contact, 'Jane Realty', {
      spaceId: 'space_1',
      userId: 'user_1',
    });

    expect(result.sent).toBe(false);
    expect(result.error).toBe('quota');
  });

  it('marks inbox send delivered only on successful=true', async () => {
    inboxRows = [{ toolkit: 'gmail' }];
    executeToolForEntityMock.mockResolvedValueOnce({ successful: true });

    const result = await sendDraft(draft, contact, 'Jane Realty', {
      spaceId: 'space_1',
      userId: 'user_1',
    });

    expect(result.sent).toBe(true);
    expect(result.method).toBe('gmail');
    expect(executeToolForEntityMock.mock.calls[0][0].arguments).toMatchObject({
      recipient_email: 'jane@example.com',
      to: 'jane@example.com',
    });
  });

  it('returns not_configured instead of sent when Resend credentials are missing', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('FROM_EMAIL', '');

    const result = await sendDraft(draft, contact, 'Jane Realty');

    expect(result.sent).toBe(false);
    expect(result.error).toBe('not_configured');
    expect(resendSendMock).not.toHaveBeenCalled();
  });
});
