import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const fireAgentTrigger = vi.fn();
const sendSMS = vi.fn();
const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];

vi.mock('@/lib/agent/fire-trigger', () => ({ fireAgentTrigger }));
vi.mock('@/lib/sms', () => ({ sendSMS }));
vi.mock('@/lib/agent/first-touch', () => ({
  firstNameOf: (full: string | null | undefined, fallback = 'there') =>
    (full ?? '').trim().split(/\s+/)[0] || fallback,
}));

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    const pass = () => chain;
    chain.select = vi.fn(pass);
    chain.eq = vi.fn(pass);
    chain.update = vi.fn(pass);
    chain.insert = vi.fn((row: Record<string, unknown>) => {
      inserts.push({ table, row });
      return Promise.resolve({ error: null });
    });
    chain.maybeSingle = vi.fn(async () => {
      if (table === 'Contact') {
        return {
          data: { id: 'c1', name: 'Sam Rivera', phone: '+15551212', leadScore: 70 },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    chain.then = (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { POST } from '@/app/api/agent/inbound/route';

function makeReq(body: unknown, secret = 'test-secret'): NextRequest {
  return new NextRequest('http://localhost/api/agent/inbound', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/agent/inbound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserts.length = 0;
    process.env.AGENT_INTERNAL_SECRET = 'test-secret';
    fireAgentTrigger.mockResolvedValue({
      queued: true,
      firstTouchReply: {
        sent: false,
        content: 'Hey Sam, this is Jordan. I can do Tue 11am — does that still work?',
      },
    });
    sendSMS.mockResolvedValue(true);
  });

  it('fires inbound_message and sends without inserting a pending draft', async () => {
    const res = await POST(
      makeReq({
        contactId: 'c1',
        spaceId: 's1',
        channel: 'sms',
        content: 'Tue works',
      }),
    );
    expect(res.status).toBe(200);
    expect(fireAgentTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 's1',
        event: 'inbound_message',
        contactId: 'c1',
        content: 'Tue works',
        channel: 'sms',
      }),
    );
    expect(sendSMS).toHaveBeenCalledWith({
      to: '+15551212',
      body: 'Hey Sam, this is Jordan. I can do Tue 11am — does that still work?',
    });
    expect(inserts.some((row) => row.table === 'AgentDraft')).toBe(false);
    expect(inserts.some((row) => row.row.status === 'pending')).toBe(false);
  });

  it('does not send again when the trigger already sent', async () => {
    fireAgentTrigger.mockResolvedValue({
      queued: true,
      firstTouchReply: { sent: true, content: 'already sent' },
    });
    const res = await POST(
      makeReq({
        contactId: 'c1',
        spaceId: 's1',
        channel: 'sms',
        content: 'Tue works',
      }),
    );
    expect(res.status).toBe(200);
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('rejects unauthorized callers', async () => {
    const res = await POST(
      makeReq(
        { contactId: 'c1', spaceId: 's1', channel: 'sms', content: 'hi' },
        'wrong',
      ),
    );
    expect(res.status).toBe(401);
    expect(fireAgentTrigger).not.toHaveBeenCalled();
    expect(sendSMS).not.toHaveBeenCalled();
  });
});
