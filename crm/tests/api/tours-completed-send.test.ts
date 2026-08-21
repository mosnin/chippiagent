import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const fireAgentTrigger = vi.fn();
const sendSMS = vi.fn();
const requireAuth = vi.fn();
const getSpaceForUser = vi.fn();
const sendTourFollowUp = vi.fn();
const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];

const existingTour = {
  id: 't1',
  spaceId: 's1',
  status: 'confirmed',
  contactId: 'c1',
  guestName: 'Sam Rivera',
  guestEmail: 'sam@example.com',
  guestPhone: '+15551212',
  propertyAddress: '1422 Pine',
  startsAt: '2026-08-21T17:00:00.000Z',
  endsAt: '2026-08-21T18:00:00.000Z',
  notes: null,
};

vi.mock('@/lib/agent/fire-trigger', () => ({ fireAgentTrigger }));
vi.mock('@/lib/sms', () => ({ sendSMS }));
vi.mock('@/lib/api-auth', () => ({ requireAuth }));
vi.mock('@/lib/space', () => ({ getSpaceForUser }));
vi.mock('@/lib/tour-emails', () => ({ sendTourFollowUp }));
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
    chain.is = vi.fn(pass);
    chain.update = vi.fn((row: Record<string, unknown>) => {
      Object.assign(chain, { _updated: row });
      return chain;
    });
    chain.insert = vi.fn((row: Record<string, unknown>) => {
      inserts.push({ table, row });
      const result = { error: null };
      return {
        then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(r, e),
      };
    });
    chain.maybeSingle = vi.fn(async () => {
      if (table === 'Tour') return { data: existingTour, error: null };
      if (table === 'Contact') {
        return { data: { id: 'c1', name: 'Sam Rivera', phone: '+15551212' }, error: null };
      }
      if (table === 'SpaceSetting') return { data: { businessName: 'Pine Realty' }, error: null };
      if (table === 'Space') return { data: { name: 'Pine Realty', slug: 'pine' }, error: null };
      return { data: null, error: null };
    });
    chain.single = vi.fn(async () => ({
      data: { ...existingTour, status: 'completed' },
      error: null,
    }));
    chain.then = (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { PATCH } from '@/app/api/tours/[id]/route';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/tours/t1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/tours/[id] tour_completed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserts.length = 0;
    requireAuth.mockResolvedValue({ userId: 'u1' });
    getSpaceForUser.mockResolvedValue({ id: 's1' });
    sendTourFollowUp.mockResolvedValue(undefined);
    fireAgentTrigger.mockResolvedValue({
      queued: true,
      tourFollowUp: {
        sent: false,
        content: 'Hey Sam, this is Jordan. How did 1422 Pine feel? Want to talk next steps?',
      },
    });
    sendSMS.mockResolvedValue(true);
  });

  it('fires tour_completed and sends without a pending draft', async () => {
    const res = await PATCH(makeReq({ status: 'completed' }), {
      params: Promise.resolve({ id: 't1' }),
    });
    expect(res.status).toBe(200);
    expect(fireAgentTrigger).toHaveBeenCalledWith({
      spaceId: 's1',
      event: 'tour_completed',
      contactId: 'c1',
      tourId: 't1',
    });
    expect(sendSMS).toHaveBeenCalledWith({
      to: '+15551212',
      body: 'Hey Sam, this is Jordan. How did 1422 Pine feel? Want to talk next steps?',
    });
    expect(inserts.some((row) => row.table === 'AgentDraft')).toBe(false);
    expect(inserts.some((row) => row.row.status === 'pending')).toBe(false);
  });

  it('does not send again when the trigger already sent', async () => {
    fireAgentTrigger.mockResolvedValue({
      queued: true,
      tourFollowUp: { sent: true, content: 'already sent' },
    });
    const res = await PATCH(makeReq({ status: 'completed' }), {
      params: Promise.resolve({ id: 't1' }),
    });
    expect(res.status).toBe(200);
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await PATCH(makeReq({ status: 'completed' }), {
      params: Promise.resolve({ id: 't1' }),
    });
    expect(res.status).toBe(401);
    expect(fireAgentTrigger).not.toHaveBeenCalled();
    expect(sendSMS).not.toHaveBeenCalled();
  });
});
