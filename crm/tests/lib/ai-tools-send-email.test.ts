import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock supabase chain + email delivery + logger ──────────────────────────
let mockByTable: Record<
  string,
  { rows?: Array<Record<string, unknown>>; error?: { message: string } | null; single?: Record<string, unknown> | null }
> = {};

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const override = mockByTable[table];
    const rows = override?.rows ?? [];
    const error = override?.error ?? null;
    const single = override?.single;

    const termThen = Promise.resolve({ data: rows, error });
    const singleThen = Promise.resolve({ data: single ?? rows[0] ?? null, error });

    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      insert: vi.fn(() => ({
        ...chain,
        then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) => termThen.then(r, e),
        catch: (e: (x: unknown) => unknown) => termThen.catch(e),
      })),
      maybeSingle: vi.fn(() => singleThen),
      abortSignal: vi.fn(() => termThen),
      then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) => termThen.then(r, e),
    };
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

const { sendEmailFromCRMMock } = vi.hoisted(() => ({ sendEmailFromCRMMock: vi.fn(async () => undefined) }));
vi.mock('@/lib/email', () => ({ sendEmailFromCRM: sendEmailFromCRMMock }));

import { sendEmailTool } from '@/lib/ai-tools/tools/send-email';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'user_1',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u1' },
    signal: new AbortController().signal,
  };
}

beforeEach(() => {
  mockByTable = {};
  sendEmailFromCRMMock.mockClear();
});

describe('sendEmailTool schema', () => {
  it('requires either contactId or toEmail', () => {
    expect(() =>
      sendEmailTool.parameters.parse({ subject: 's', body: 'b' }),
    ).toThrow();
  });

  it('requires a subject + body', () => {
    expect(() =>
      sendEmailTool.parameters.parse({ toEmail: 'a@b.com', body: 'b' }),
    ).toThrow();
    expect(() =>
      sendEmailTool.parameters.parse({ toEmail: 'a@b.com', subject: 's' }),
    ).toThrow();
  });

  it('rejects malformed email addresses', () => {
    expect(() =>
      sendEmailTool.parameters.parse({ toEmail: 'not-an-email', subject: 's', body: 'b' }),
    ).toThrow();
  });

  it('caps body + subject length', () => {
    expect(() =>
      sendEmailTool.parameters.parse({
        toEmail: 'a@b.com',
        subject: 'x'.repeat(250),
        body: 'b',
      }),
    ).toThrow();
  });

  it('requires approval before the handler runs', () => {
    expect(sendEmailTool.requiresApproval).toBe(true);
  });
});

describe('sendEmailTool handler — contactId path', () => {
  it('sends to the contact\'s email on file', async () => {
    mockByTable = {
      Contact: {
        single: { id: 'c_1', email: 'jane@example.com', name: 'Jane' },
      },
      SpaceSetting: { single: { businessName: 'Jane Realty' } },
    };
    const result = await sendEmailTool.handler(
      {
        contactId: 'c_1',
        subject: 'Tour Friday',
        body: 'Looking forward to it.',
      },
      makeCtx(),
    );

    expect(sendEmailFromCRMMock).toHaveBeenCalledTimes(1);
    expect((sendEmailFromCRMMock.mock.calls as unknown[][])[0][0]).toMatchObject({
      toEmail: 'jane@example.com',
      fromName: 'Jane Realty',
      subject: 'Tour Friday',
    });
    expect(result.summary).toContain('jane@example.com');
    expect(result.display).toBe('success');
    expect((result.data as { contactId: string }).contactId).toBe('c_1');
  });

  it('refuses to send when the contact has no email', async () => {
    mockByTable = {
      Contact: {
        single: { id: 'c_2', email: null, name: 'Phoneless' },
      },
    };
    const result = await sendEmailTool.handler(
      { contactId: 'c_2', subject: 'Hi', body: 'Hi.' },
      makeCtx(),
    );
    expect(sendEmailFromCRMMock).not.toHaveBeenCalled();
    expect(result.summary).toMatch(/no email on file/);
    expect(result.display).toBe('error');
  });

  it('refuses when contactId does not exist in this space', async () => {
    mockByTable = { Contact: { single: null } };
    const result = await sendEmailTool.handler(
      { contactId: 'bogus', subject: 'Hi', body: 'Hi.' },
      makeCtx(),
    );
    expect(sendEmailFromCRMMock).not.toHaveBeenCalled();
    expect(result.summary).toMatch(/No contact with id/);
    expect(result.display).toBe('error');
  });
});

describe('sendEmailTool handler — toEmail path', () => {
  it('sends to a bare address even without a matching contact', async () => {
    mockByTable = {
      Contact: { single: null },
      SpaceSetting: { single: { businessName: 'Jane Realty' } },
    };
    const result = await sendEmailTool.handler(
      { toEmail: 'stranger@elsewhere.com', subject: 'Hi', body: 'Hi.' },
      makeCtx(),
    );
    expect(sendEmailFromCRMMock).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: 'stranger@elsewhere.com' }),
    );
    expect(result.display).toBe('success');
    expect((result.data as { contactId: string | null }).contactId).toBeNull();
  });
});

describe('sendEmailTool handler — errors', () => {
  it('surfaces a delivery failure without throwing', async () => {
    mockByTable = {
      Contact: { single: null },
      SpaceSetting: { single: null },
    };
    sendEmailFromCRMMock.mockRejectedValueOnce(new Error('Resend quota exhausted'));

    const result = await sendEmailTool.handler(
      { toEmail: 'a@b.com', subject: 'Hi', body: 'Hi.' },
      makeCtx(),
    );
    expect(result.summary).toMatch(/Send failed.*Resend quota exhausted/);
    expect(result.display).toBe('error');
  });
});
