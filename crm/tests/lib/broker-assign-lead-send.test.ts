import { describe, it, expect, vi, beforeEach } from 'vitest';

const fireAgentTrigger = vi.fn();
const sendSMS = vi.fn();
const notifyNewLead = vi.fn();
const getSpaceByOwnerId = vi.fn();
const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];

vi.mock('@/lib/agent/fire-trigger', () => ({ fireAgentTrigger }));
vi.mock('@/lib/sms', () => ({ sendSMS }));
vi.mock('@/lib/notify', () => ({ notifyNewLead }));
vi.mock('@/lib/space', () => ({ getSpaceByOwnerId }));
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
          data: {
            id: 'orig',
            name: 'Sam Rivera',
            phone: '+15551212',
            email: 'sam@example.com',
            tags: ['new-lead'],
            notes: null,
            type: 'RENTER',
            properties: [],
            scoringStatus: null,
            leadScore: 80,
            scoreLabel: 'hot',
            scoreSummary: null,
            scoreDetails: null,
            applicationData: null,
            applicationRef: null,
            applicationStatus: null,
            budget: null,
            preferences: null,
            address: null,
          },
          error: null,
        };
      }
      if (table === 'BrokerageMembership') {
        return { data: { id: 'm1', role: 'agent', userId: 'realtor_1' }, error: null };
      }
      if (table === 'User') {
        return { data: { name: 'Jordan Lee', email: 'jordan@example.com' }, error: null };
      }
      return { data: null, error: null };
    });
    chain.then = (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { assignLeadToRealtor } from '@/lib/broker-assign-lead';

describe('assignLeadToRealtor fire + send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserts.length = 0;
    getSpaceByOwnerId.mockImplementation(async (userId: string) => {
      if (userId === 'broker_owner') return { id: 'broker_space' };
      if (userId === 'realtor_1') return { id: 'realtor_space' };
      return null;
    });
    notifyNewLead.mockResolvedValue(undefined);
    fireAgentTrigger.mockResolvedValue({
      queued: true,
      firstTouch: { sent: false, content: 'Hey Sam, this is Jordan. I can do Tue 11am or Wed 4pm — which works?' },
    });
    sendSMS.mockResolvedValue(true);
  });

  it('fires new_lead and sends without inserting a pending draft', async () => {
    const result = await assignLeadToRealtor({
      brokerage: { id: 'b1', ownerId: 'broker_owner', name: 'Pine' },
      assignedByUserId: 'broker_user',
      contactId: 'orig',
      realtorUserId: 'realtor_1',
    });
    expect(result.ok).toBe(true);
    expect(fireAgentTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'realtor_space',
        event: 'new_lead',
      }),
    );
    expect(sendSMS).toHaveBeenCalledWith({
      to: '+15551212',
      body: 'Hey Sam, this is Jordan. I can do Tue 11am or Wed 4pm — which works?',
    });
    expect(inserts.some((row) => row.table === 'AgentDraft')).toBe(false);
    expect(inserts.some((row) => row.row.status === 'pending')).toBe(false);
  });

  it('does not send again when first-touch already sent', async () => {
    fireAgentTrigger.mockResolvedValue({
      queued: true,
      firstTouch: { sent: true, content: 'already sent' },
    });
    const result = await assignLeadToRealtor({
      brokerage: { id: 'b1', ownerId: 'broker_owner', name: 'Pine' },
      assignedByUserId: 'broker_user',
      contactId: 'orig',
      realtorUserId: 'realtor_1',
    });
    expect(result.ok).toBe(true);
    expect(sendSMS).not.toHaveBeenCalled();
  });
});
