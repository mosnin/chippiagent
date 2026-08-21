import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { sendSMS } = vi.hoisted(() => ({ sendSMS: vi.fn() }));

vi.mock('@/lib/sms', () => ({ sendSMS }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

type Row = Record<string, unknown>;

let tables: Record<
  string,
  {
    single?: Row | null;
    rows?: Row[];
    insertError?: { message: string } | null;
    updateError?: { message: string } | null;
  }
> = {};
let insertedDraft: Row | null = null;
let updatedDraft: Row | null = null;

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const override = tables[table] ?? {};
    const rows = override.rows ?? (override.single ? [override.single] : []);
    const chain: Record<string, unknown> = {};
    const pass = () => chain;
    chain.select = vi.fn(pass);
    chain.eq = vi.fn(pass);
    chain.gte = vi.fn(pass);
    chain.order = vi.fn(pass);
    chain.limit = vi.fn(pass);
    chain.maybeSingle = vi.fn(async () => ({ data: override.single ?? null, error: null }));
    chain.single = vi.fn(async () => ({ data: override.single ?? null, error: null }));
    chain.insert = vi.fn((row: Row) => {
      insertedDraft = table === 'AgentDraft' ? row : insertedDraft;
      const result = {
        data: override.insertError ? null : { id: (row.id as string) ?? 'draft_tour_1' },
        error: override.insertError ?? null,
      };
      return {
        select: vi.fn(() => ({
          maybeSingle: vi.fn(async () => result),
          single: vi.fn(async () => result),
        })),
        maybeSingle: vi.fn(async () => result),
      };
    });
    chain.update = vi.fn((row: Row) => {
      if (table === 'AgentDraft') updatedDraft = row;
      const result = { data: override.updateError ? null : { id: 'draft_empty' }, error: override.updateError ?? null };
      return {
        eq: vi.fn(() => ({
          eq: vi.fn(async () => result),
          then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) => Promise.resolve(result).then(r, e),
        })),
        then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) => Promise.resolve(result).then(r, e),
      };
    });
    chain.then = (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import {
  assertSentDraftPersist,
  assertValidTourFollowUpText,
  composeTourFollowUpSms,
  draftTourFollowUpForContact,
  isTourCompletedFollowUpEvent,
  isTourFollowUpDraft,
} from '@/lib/agent/tour-follow-up';
import { TOUR_COMPLETED_EVENT } from '@/lib/agent/trigger-policy';

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../lib/agent/tour-follow-up.ts'),
  'utf8',
);
const TOUR_ROUTE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../app/api/tours/[id]/route.ts'),
  'utf8',
);

const TOUR_REASON = 'Tour-completed follow-up SMS — ask how the showing felt. Sent.';
const FIRST_TOUCH_REASON = 'First-touch SMS for a new inbound lead — two showing windows. Sent.';

const OLD_ENV = { ...process.env };

beforeEach(() => {
  tables = {};
  insertedDraft = null;
  updatedDraft = null;
  process.env.TELNYX_API_KEY = 'test-key';
  process.env.TELNYX_FROM_NUMBER = '+15555550100';
  sendSMS.mockReset();
  sendSMS.mockResolvedValue(true);
});

afterEach(() => {
  process.env = { ...OLD_ENV };
});

describe('tour-follow-up source invariants', () => {
  it('sends through Telnyx and never persists pending', () => {
    expect(SOURCE).toMatch(/sendAutonomousSms/);
    expect(SOURCE).toMatch(/status:\s*['"]sent['"]/);
    expect(SOURCE).not.toMatch(/status:\s*['"]pending['"]/);
    expect(SOURCE).not.toMatch(/awaiting approval|Never sent|draft parked/i);
    expect(SOURCE).not.toMatch(/Chippy/);
  });

  it('fires tour_completed from the real tour PATCH completion path', () => {
    expect(TOUR_ROUTE).toMatch(/fireAgentTrigger/);
    expect(TOUR_ROUTE).toMatch(/event:\s*'tour_completed'/);
    expect(TOUR_ROUTE).toMatch(/body\.status === 'completed'/);
    expect(TOUR_ROUTE).toMatch(/tourId:\s*data\.id/);
    expect(TOUR_ROUTE).not.toMatch(/Chippy/);
  });
});

describe('tour-completed follow-up events', () => {
  it('wakes on tour_completed only', () => {
    expect(TOUR_COMPLETED_EVENT).toBe('tour_completed');
    expect(isTourCompletedFollowUpEvent('tour_completed')).toBe(true);
    expect(isTourCompletedFollowUpEvent('new_lead')).toBe(false);
    expect(isTourCompletedFollowUpEvent('inbound_message')).toBe(false);
    expect(isTourCompletedFollowUpEvent('deal_stage_changed')).toBe(false);
    expect(isTourCompletedFollowUpEvent('goal_completed')).toBe(false);
  });
});

describe('composeTourFollowUpSms', () => {
  it('fails if the body is empty or claims it was sent', () => {
    expect(() =>
      assertValidTourFollowUpText('', { agentToken: 'Jordan', tone: 'warm' }),
    ).toThrow(/empty/);
    expect(() =>
      assertValidTourFollowUpText('Hi Sam — sent this automatically. Thoughts on 1422 Pine?', {
        agentToken: 'Jordan',
        tone: 'direct',
      }),
    ).toThrow(/sent/);
  });

  it('rejects sent / live / booked / reserved / locked claims', () => {
    expect(() =>
      assertValidTourFollowUpText('Hey Sam, this is Jordan. Showing is live. Want to talk next steps?', {
        agentToken: 'Jordan',
        tone: 'warm',
      }),
    ).toThrow(/booked/);
    expect(() =>
      assertValidTourFollowUpText('Hey Sam, this is Jordan. Tue 11am is booked. Want to talk next steps?', {
        agentToken: 'Jordan',
        tone: 'warm',
      }),
    ).toThrow(/booked/);
    expect(() =>
      assertValidTourFollowUpText('Hey Sam, this is Jordan. Time is reserved. Want to talk next steps?', {
        agentToken: 'Jordan',
        tone: 'warm',
      }),
    ).toThrow(/booked/);
    expect(() =>
      assertValidTourFollowUpText('Hey Sam, this is Jordan. Slot is locked. Want to talk next steps?', {
        agentToken: 'Jordan',
        tone: 'warm',
      }),
    ).toThrow(/booked/);
    expect(() =>
      assertValidTourFollowUpText('Hey Sam, this is Jordan. 1422 Pine is held. Want to talk next steps?', {
        agentToken: 'Jordan',
        tone: 'warm',
      }),
    ).toThrow(/booked/);
  });

  it('rejects a draft that claims the deal is closed', () => {
    expect(() =>
      assertValidTourFollowUpText('Hey Sam, this is Jordan. The deal is closed. Want to talk next steps?', {
        agentToken: 'Jordan',
        tone: 'warm',
      }),
    ).toThrow(/closed/);
  });

  it('writes a short warm ask in the assigned agent voice', () => {
    const text = composeTourFollowUpSms({
      contactFirstName: 'Sam Rivera',
      voice: { tone: 'warm', agentFirstName: 'Jordan Lee', businessName: 'Pine Realty' },
      property: '1422 Pine',
    });
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('Sam');
    expect(text).toContain('Jordan');
    expect(text).toContain('1422 Pine');
    expect(text).toMatch(/this is|want to talk next/i);
    expect(text).not.toMatch(/chippy/i);
    expect(text).not.toMatch(/\b(sent|booked|live|reserved|locked|held)\b/i);
    expect(text).not.toMatch(/deal is closed|we closed|closed the deal/i);
  });

  it('keeps direct / formal / casual distinct from each other', () => {
    const base = { contactFirstName: 'Sam', property: '1422 Pine' };
    const direct = composeTourFollowUpSms({
      ...base,
      voice: { tone: 'direct', agentFirstName: 'Jordan' },
    });
    const formal = composeTourFollowUpSms({
      ...base,
      voice: { tone: 'formal', agentFirstName: 'Jordan', businessName: 'Pine Realty' },
    });
    const casual = composeTourFollowUpSms({
      ...base,
      voice: { tone: 'casual', agentFirstName: 'Jordan' },
    });
    expect(direct).toMatch(/thoughts on|ready to talk next/i);
    expect(formal).toMatch(/would you like to discuss/i);
    expect(casual).toMatch(/how'd|want to chat next/i);
    expect(direct).not.toEqual(formal);
    expect(formal).not.toEqual(casual);
    for (const text of [direct, formal, casual]) {
      expect(text).not.toMatch(/\b(sent|booked|live|reserved|locked|held)\b/i);
    }
  });
});

describe('assertSentDraftPersist', () => {
  it('rejects any persist that is pending or not sent', () => {
    expect(() => assertSentDraftPersist({ status: 'pending' })).toThrow(/pending/);
    expect(() => assertSentDraftPersist({ status: 'live' })).toThrow(/must be sent/);
    expect(() => assertSentDraftPersist({ status: 'booked' })).toThrow(/must be sent/);
    expect(() => assertSentDraftPersist({ status: 'approved' })).toThrow(/must be sent/);
    expect(() => assertSentDraftPersist({ status: 'sent' })).not.toThrow();
  });
});

describe('draftTourFollowUpForContact', () => {
  function seedHappyPath(drafts?: Row[]) {
    tables = {
      Contact: {
        single: {
          id: 'c1',
          name: 'Sam Rivera',
          phone: '+15555550123',
          address: '1422 Pine',
          properties: [],
          applicationData: null,
          spaceId: 's1',
        },
      },
      Tour: {
        rows: [
          {
            id: 't1',
            status: 'completed',
            propertyAddress: '1422 Pine',
            contactId: 'c1',
            spaceId: 's1',
            updatedAt: '2026-08-21T18:00:00.000Z',
          },
        ],
      },
      AgentDraft: { rows: drafts ?? [] },
      AIUserProfile: { single: { displayName: 'Jordan Lee', communicationTone: 'direct' } },
      SpaceSetting: { single: { businessName: 'Pine Realty' } },
      Space: { single: { name: 'Pine Realty' } },
    };
  }

  it('sends the follow-up SMS through Telnyx and records it as sent', async () => {
    seedHappyPath();
    const result = await draftTourFollowUpForContact({
      spaceId: 's1',
      contactId: 'c1',
      tourId: 't1',
      now: new Date('2026-08-21T18:05:00Z'),
    });
    expect(result.sent).toBe(true);
    expect(result.status).toBe('sent');
    expect(result.channel).toBe('sms');
    expect(result.action).toBe('sent');
    expect(result.content.trim().length).toBeGreaterThan(0);
    expect(result.content).toContain('Jordan');
    expect(result.content).toContain('Sam');
    expect(sendSMS).toHaveBeenCalledWith({
      to: '+15555550123',
      body: result.content,
    });
    expect(insertedDraft).toMatchObject({
      spaceId: 's1',
      contactId: 'c1',
      channel: 'sms',
      status: 'sent',
    });
    expect(insertedDraft?.status).not.toBe('pending');
    expect(String(insertedDraft?.content ?? '')).not.toMatch(/\b(sent|live|booked|reserved|locked|held)\b/i);
    expect(String(insertedDraft?.reasoning ?? '')).not.toMatch(/awaiting approval|Never sent|draft parked/i);
  });

  it('fails with a real error when Telnyx credentials are missing — never parks pending', async () => {
    seedHappyPath();
    delete process.env.TELNYX_API_KEY;
    delete process.env.TELNYX_FROM_NUMBER;
    await expect(
      draftTourFollowUpForContact({
        spaceId: 's1',
        contactId: 'c1',
        tourId: 't1',
        now: new Date('2026-08-21T18:05:00Z'),
      }),
    ).rejects.toThrow(/Telnyx credentials missing/);
    expect(insertedDraft).toBeNull();
    expect(updatedDraft).toBeNull();
  });

  it('skips when no completed tour exists — do not invent the event', async () => {
    seedHappyPath();
    tables.Tour = { rows: [] };
    const result = await draftTourFollowUpForContact({ spaceId: 's1', contactId: 'c1' });
    expect(result.action).toBe('skipped');
    expect(result.reason).toBe('no_completed_tour');
    expect(result.sent).toBe(false);
    expect(insertedDraft).toBeNull();
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('returns an existing sent tour-follow-up instead of sending a second one', async () => {
    seedHappyPath([
      {
        id: 'd_old',
        content: 'Hi Sam — Jordan here. Thoughts on 1422 Pine? Ready to talk next?',
        status: 'sent',
        channel: 'sms',
        reasoning: TOUR_REASON,
        createdAt: '2026-08-21T18:00:00.000Z',
      },
    ]);
    const result = await draftTourFollowUpForContact({ spaceId: 's1', contactId: 'c1' });
    expect(result.action).toBe('deduped');
    expect(result.draftId).toBe('d_old');
    expect(result.sent).toBe(true);
    expect(result.status).toBe('sent');
    expect(insertedDraft).toBeNull();
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('does not treat a leftover pending first-touch as the tour-follow-up stub', async () => {
    seedHappyPath([
      {
        id: 'd_first',
        content: 'Hey Sam, this is Jordan. I can do Tue 11am or Wed 4pm — which works?',
        status: 'pending',
        channel: 'sms',
        reasoning: FIRST_TOUCH_REASON,
        createdAt: '2026-08-21T14:00:00.000Z',
      },
    ]);
    const result = await draftTourFollowUpForContact({ spaceId: 's1', contactId: 'c1' });
    expect(result.action).toBe('sent');
    expect(result.draftId).not.toBe('d_first');
    expect(insertedDraft?.reasoning).toMatch(/Tour-completed follow-up SMS/);
    expect(insertedDraft?.status).toBe('sent');
    expect(sendSMS).toHaveBeenCalled();
  });

  it('fills an empty tour-follow-up stub after a real send', async () => {
    seedHappyPath([
      {
        id: 'd_empty',
        content: '   ',
        status: 'pending',
        channel: 'sms',
        reasoning: TOUR_REASON,
        createdAt: '2026-08-21T18:00:00.000Z',
      },
    ]);
    const result = await draftTourFollowUpForContact({
      spaceId: 's1',
      contactId: 'c1',
      now: new Date('2026-08-21T18:05:00Z'),
    });
    expect(result.action).toBe('filled');
    expect(result.draftId).toBe('d_empty');
    expect(result.content.trim().length).toBeGreaterThan(0);
    expect(result.status).toBe('sent');
    expect(result.sent).toBe(true);
    expect(sendSMS).toHaveBeenCalled();
    expect(updatedDraft?.content).toBe(result.content);
    expect(updatedDraft?.status).toBe('sent');
    expect(updatedDraft?.status).not.toBe('pending');
  });

  it('distinguishes tour-follow-up drafts from first-touch', () => {
    expect(isTourFollowUpDraft({ reasoning: TOUR_REASON })).toBe(true);
    expect(isTourFollowUpDraft({ reasoning: FIRST_TOUCH_REASON })).toBe(false);
  });
});
