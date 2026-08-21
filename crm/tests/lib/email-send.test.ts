import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.hoisted(() => vi.fn());

vi.mock('resend', () => ({
  Resend: class Resend {
    emails = { send: sendMock };
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

import { sendEmailFromCRM } from '@/lib/email';

const validParams = {
  toEmail: 'jane@example.com',
  fromName: 'Jane Realty',
  subject: 'Tour Friday',
  body: 'See you at 2.',
};

describe('sendEmailFromCRM', () => {
  beforeEach(() => {
    sendMock.mockReset();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws when RESEND_API_KEY is missing instead of resolving as sent', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    await expect(sendEmailFromCRM(validParams)).rejects.toThrow(/RESEND_API_KEY missing/);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('throws when the recipient is missing or invalid', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    await expect(
      sendEmailFromCRM({ ...validParams, toEmail: '' }),
    ).rejects.toThrow(/Recipient email is missing or invalid/);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('throws on a Resend API error instead of resolving as sent', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'Invalid `to` field' },
    });
    await expect(sendEmailFromCRM(validParams)).rejects.toThrow(/Invalid `to` field/);
  });

  it('sends to the provided recipient and only that address', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    sendMock.mockResolvedValueOnce({ data: { id: 'msg_1' }, error: null });

    await sendEmailFromCRM(validParams);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0]).toMatchObject({
      to: 'jane@example.com',
      subject: 'Tour Friday',
    });
  });
});
