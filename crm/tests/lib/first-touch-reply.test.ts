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
    listError?: { message: string } | null;
    insertError?: { message: string } | null;
    updateError?: { message: string } | null;
    updateZeroRows?: boolean;
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
        data: override.insertError ? null : { id: (row.id as string) ?? 'draft_reply_1' },
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
      const result = {
        data: override.updateError || override.updateZeroRows ? [] : [{ id: 'draft_empty' }],
        error: override.updateError ?? null,
      };
      const terminal: Record<string, unknown> = {};
      terminal.eq = vi.fn(() => terminal);
      terminal.select = vi.fn(() => terminal);
      terminal.then = (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(r, e);
      return terminal;
    });
    chain.then = (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
      Promise.resolve({ data: override.listError ? null : rows, error: override.listError ?? null }).then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import {
  assertValidFirstTouchReplyText,
  composeFirstTouchReplySms,
  draftFirstTouchReplyForLead,
  extractWindowLabels,
  isFirstTouchDraft,
  isFirstTouchReplyDraft,
  isInboundFirstTouchReplyEvent,
  pickOfferedWindow,
} from '@/lib/agent/first-touch-reply';
import { INBOUND_MESSAGE_EVENT } from '@/lib/agent/trigger-policy';

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../lib/agent/first-touch-reply.ts'),
  'utf8',
);

const FIRST_TOUCH_REASON = 'First-touch SMS for a new inbound lead — two showing windows. Sent.';
const REPLY_REASON = 'Reply to first-touch — book a showing. Sent.';
const FIRST_TOUCH_BODY = 'Hey Sam, this is Jordan. I can do Tue 11am or Wed 4pm — which works?';

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

describe('first-touch-reply source invariants', () => {
  it('sends through Telnyx and never persists pending', () => {
    expect(SOURCE).toMatch(/sendAutonomousSms/);
    expect(SOURCE).toMatch(/status:\s*['"]sent['"]/);
    expect(SOURCE).not.toMatch(/status:\s*['"]pending['"]/);
    expect(SOURCE).not.toMatch(/awaiting approval|Never sent|draft parked/i);
    expect(SOURCE).not.toMatch(/book_tour|from\(['"]Tour['"]\)/);
    expect(SOURCE).not.toMatch(/Chippy/);
  });
});

describe('inbound first-touch-reply events', () => {
  it('wakes on inbound_message only', () => {
    expect(INBOUND_MESSAGE_EVENT).toBe('inbound_message');
    expect(isInboundFirstTouchReplyEvent('inbound_message')).toBe(true);
    expect(isInboundFirstTouchReplyEvent('new_lead')).toBe(false);
    expect(isInboundFirstTouchReplyEvent('application_submitted')).toBe(false);
  });
});

describe('pickOfferedWindow', () => {
  const offered = ['Tue 11am', 'Wed 4pm'];

  it('confirms an exact window the lead named', () => {
    expect(pickOfferedWindow('Tue 11am works', offered)).toBe('Tue 11am');
  });

  it('confirms the first / second window', () => {
    expect(pickOfferedWindow('the first one', offered)).toBe('Tue 11am');
    expect(pickOfferedWindow('second works', offered)).toBe('Wed 4pm');
  });

  it('does not invent a pick from a bare yes', () => {
    expect(pickOfferedWindow('yes', offered)).toBeUndefined();
    expect(pickOfferedWindow('', offered)).toBeUndefined();
  });
});

describe('composeFirstTouchReplySms', () => {
  const windows = [
    { startsAt: new Date('2026-08-25T15:00:00Z'), label: 'Tue 11am' },
    { startsAt: new Date('2026-08-26T20:00:00Z'), label: 'Wed 4pm' },
  ];

  it('fails if the body is empty or claims it was sent', () => {
    expect(() =>
      assertValidFirstTouchReplyText('', {
        windows: ['Tue 11am', 'Wed 4pm'],
        agentToken: 'Jordan',
        tone: 'warm',
      }),
    ).toThrow(/empty/);
    expect(() =>
      assertValidFirstTouchReplyText('Hi Sam — auto-sent. Tue 11am still work for you?', {
        windows: ['Tue 11am'],
        agentToken: 'Jordan',
        tone: 'direct',
        picked: 'Tue 11am',
      }),
    ).toThrow(/sent/);
    expect(() =>
      assertValidFirstTouchReplyText('Hi Sam — Jordan here. Tue 11am is held.', {
        windows: ['Tue 11am'],
        agentToken: 'Jordan',
        tone: 'direct',
        picked: 'Tue 11am',
      }),
    ).toThrow(/booked/);
    expect(() =>
      assertValidFirstTouchReplyText('Hi Sam — Jordan here. Tue 11am is booked.', {
        windows: ['Tue 11am'],
        agentToken: 'Jordan',
        tone: 'direct',
        picked: 'Tue 11am',
      }),
    ).toThrow(/booked/);
    expect(() =>
      assertValidFirstTouchReplyText('Hi Sam — Jordan here. Showing is live. Tue 11am.', {
        windows: ['Tue 11am'],
        agentToken: 'Jordan',
        tone: 'direct',
        picked: 'Tue 11am',
      }),
    ).toThrow(/booked/);
  });

  it('confirms a picked window in the assigned agent voice without claiming it is booked', () => {
    const text = composeFirstTouchReplySms({
      contactFirstName: 'Sam Rivera',
      voice: { tone: 'direct', agentFirstName: 'Jordan Lee' },
      windows,
      picked: 'Tue 11am',
    });
    expect(text.trim().length).toBeGreaterThan(0);
    expect(text).toContain('Sam');
    expect(text).toContain('Jordan');
    expect(text).toContain('Tue 11am');
    expect(text).toMatch(/still work for you/i);
    expect(text).not.toMatch(/chippy/i);
    expect(text).not.toMatch(/\b(sent|booked|live|reserved|locked)\b/i);
    expect(text).not.toMatch(/is held|i'll lock|see you then|see you there/i);
  });

  it('re-offers two concrete windows when they did not pick', () => {
    const text = composeFirstTouchReplySms({
      contactFirstName: 'Sam',
      voice: { tone: 'warm', agentFirstName: 'Jordan' },
      windows,
    });
    expect(text).toContain('Tue 11am');
    expect(text).toContain('Wed 4pm');
    expect(text).toContain('Jordan');
    expect(text.trim().length).toBeGreaterThan(0);
    expect(text).not.toMatch(/\b(sent|booked|live|reserved|locked)\b/i);
  });
});

describe('draftFirstTouchReplyForLead', () => {
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
      AgentDraft: {
        rows:
          drafts ??
          [
            {
              id: 'd_first',
              content: FIRST_TOUCH_BODY,
              status: 'pending',
              channel: 'sms',
              reasoning: FIRST_TOUCH_REASON,
              createdAt: '2026-08-21T14:00:00.000Z',
            },
          ],
      },
      AIUserProfile: { single: { displayName: 'Jordan Lee', communicationTone: 'direct' } },
      SpaceSetting: {
        single: {
          businessName: 'Pine Realty',
          timezone: 'UTC',
          tourStartHour: 9,
          tourEndHour: 17,
          tourDaysAvailable: [1, 2, 3, 4, 5],
        },
      },
      Space: { single: { name: 'Pine Realty' } },
    };
  }

  it('fails if a first-touch reply produces no SMS', async () => {
    seedHappyPath();
    const result = await draftFirstTouchReplyForLead({
      spaceId: 's1',
      contactId: 'c1',
      replyText: 'yes interested',
      now: new Date('2026-08-21T15:00:00Z'),
    });
    expect(result.action).toBe('sent');
    expect(result.draftId).toBeTruthy();
    expect(result.content.trim().length).toBeGreaterThan(0);
    expect(result.sent).toBe(true);
    expect(sendSMS).toHaveBeenCalled();
    expect(insertedDraft).not.toBeNull();
    expect(insertedDraft?.status).not.toBe('pending');
  });

  it('sends the booking SMS through Telnyx and records it as sent', async () => {
    seedHappyPath();
    const result = await draftFirstTouchReplyForLead({
      spaceId: 's1',
      contactId: 'c1',
      replyText: 'Tue 11am works',
      now: new Date('2026-08-21T15:00:00Z'),
    });
    expect(result.sent).toBe(true);
    expect(result.status).toBe('sent');
    expect(result.channel).toBe('sms');
    expect(result.action).toBe('sent');
    expect(result.picked).toBe('Tue 11am');
    expect(result.content.trim().length).toBeGreaterThan(0);
    expect(result.content).toContain('Tue 11am');
    expect(result.content).toContain('Jordan');
    expect(sendSMS).toHaveBeenCalledWith({
      to: '+15555550123',
      body: result.content,
    });
    expect(insertedDraft).toMatchObject({
      spaceId: 's1',
      contactId: 'c1',
      channel: 'sms',
      status: 'sent',
      reasoning: REPLY_REASON,
    });
    expect(insertedDraft?.status).not.toBe('pending');
    expect(String(insertedDraft?.content ?? '')).not.toMatch(/\b(sent|live|booked|reserved|locked)\b/i);
    expect(String(insertedDraft?.reasoning ?? '')).not.toMatch(/awaiting approval|Never sent|draft parked/i);
  });

  it('fails with a real error when Telnyx credentials are missing — never parks pending', async () => {
    seedHappyPath();
    delete process.env.TELNYX_API_KEY;
    delete process.env.TELNYX_FROM_NUMBER;
    await expect(
      draftFirstTouchReplyForLead({
        spaceId: 's1',
        contactId: 'c1',
        replyText: 'Tue 11am works',
        now: new Date('2026-08-21T15:00:00Z'),
      }),
    ).rejects.toThrow(/Telnyx credentials missing/);
    expect(insertedDraft).toBeNull();
    expect(updatedDraft).toBeNull();
  });

  it('skips when there is no first-touch to reply to', async () => {
    seedHappyPath([]);
    const result = await draftFirstTouchReplyForLead({
      spaceId: 's1',
      contactId: 'c1',
      replyText: 'Tue 11am',
    });
    expect(result.action).toBe('skipped');
    expect(result.reason).toBe('no_first_touch');
    expect(result.sent).toBe(false);
    expect(insertedDraft).toBeNull();
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('does not treat a pending first-touch as the reply stub', async () => {
    seedHappyPath();
    const result = await draftFirstTouchReplyForLead({
      spaceId: 's1',
      contactId: 'c1',
      replyText: 'yes',
      now: new Date('2026-08-21T15:00:00Z'),
    });
    expect(result.action).toBe('sent');
    expect(result.draftId).not.toBe('d_first');
    expect(insertedDraft?.reasoning).toMatch(/Reply to first-touch/);
    expect(sendSMS).toHaveBeenCalled();
    expect(insertedDraft?.status).toBe('sent');
  });

  it('returns an existing sent reply instead of sending a second one', async () => {
    seedHappyPath([
      {
        id: 'd_reply',
        content: 'Hi Sam — Jordan here. Tue 11am still work for you?',
        status: 'sent',
        channel: 'sms',
        reasoning: REPLY_REASON,
        createdAt: '2026-08-21T14:30:00.000Z',
      },
      {
        id: 'd_first',
        content: FIRST_TOUCH_BODY,
        status: 'sent',
        channel: 'sms',
        reasoning: FIRST_TOUCH_REASON,
        createdAt: '2026-08-21T14:00:00.000Z',
      },
    ]);
    const result = await draftFirstTouchReplyForLead({ spaceId: 's1', contactId: 'c1', replyText: 'Tue 11am' });
    expect(result.action).toBe('deduped');
    expect(result.draftId).toBe('d_reply');
    expect(result.sent).toBe(true);
    expect(result.status).toBe('sent');
    expect(insertedDraft).toBeNull();
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('fills an empty reply stub after a real send', async () => {
    seedHappyPath([
      {
        id: 'd_empty',
        content: '   ',
        status: 'pending',
        channel: 'sms',
        reasoning: REPLY_REASON,
        createdAt: '2026-08-21T14:30:00.000Z',
      },
      {
        id: 'd_first',
        content: FIRST_TOUCH_BODY,
        status: 'sent',
        channel: 'sms',
        reasoning: FIRST_TOUCH_REASON,
        createdAt: '2026-08-21T14:00:00.000Z',
      },
    ]);
    const result = await draftFirstTouchReplyForLead({
      spaceId: 's1',
      contactId: 'c1',
      replyText: 'Wed 4pm',
      now: new Date('2026-08-21T15:00:00Z'),
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

  it('fails closed when the sent-draft lookup errors — do not send a duplicate', async () => {
    seedHappyPath();
    tables.AgentDraft = { rows: [], listError: { message: 'connection timeout' } };
    await expect(
      draftFirstTouchReplyForLead({
        spaceId: 's1',
        contactId: 'c1',
        replyText: 'Tue 11am',
        now: new Date('2026-08-21T15:00:00Z'),
      }),
    ).rejects.toThrow(/Draft lookup failed/);
    expect(sendSMS).not.toHaveBeenCalled();
    expect(insertedDraft).toBeNull();
  });

  it('does not treat a tour-follow-up sourceDraftId as first-touch', async () => {
    seedHappyPath([
      {
        id: 'd_tour',
        content: 'Hey Sam, this is Jordan. How did 1422 Pine feel? Want to talk next steps?',
        status: 'sent',
        channel: 'sms',
        reasoning: 'Tour-completed follow-up SMS — ask how the showing felt. Sent.',
        createdAt: '2026-08-21T16:00:00.000Z',
      },
    ]);
    const result = await draftFirstTouchReplyForLead({
      spaceId: 's1',
      contactId: 'c1',
      replyText: 'it was great',
      sourceDraftId: 'd_tour',
    });
    expect(result.action).toBe('skipped');
    expect(result.reason).toBe('no_first_touch');
    expect(result.sent).toBe(false);
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('falls back to the real first-touch when sourceDraftId is a different draft', async () => {
    seedHappyPath([
      {
        id: 'd_tour',
        content: 'Hey Sam, this is Jordan. How did 1422 Pine feel? Want to talk next steps?',
        status: 'sent',
        channel: 'sms',
        reasoning: 'Tour-completed follow-up SMS — ask how the showing felt. Sent.',
        createdAt: '2026-08-21T16:00:00.000Z',
      },
      {
        id: 'd_first',
        content: FIRST_TOUCH_BODY,
        status: 'sent',
        channel: 'sms',
        reasoning: FIRST_TOUCH_REASON,
        createdAt: '2026-08-21T14:00:00.000Z',
      },
    ]);
    const result = await draftFirstTouchReplyForLead({
      spaceId: 's1',
      contactId: 'c1',
      replyText: 'Tue 11am',
      sourceDraftId: 'd_tour',
      now: new Date('2026-08-21T16:30:00Z'),
    });
    expect(result.sent).toBe(true);
    expect(result.picked).toBe('Tue 11am');
    expect(sendSMS).toHaveBeenCalled();
  });

  it('never auto-sends an email inbound as an SMS', async () => {
    seedHappyPath();
    const result = await draftFirstTouchReplyForLead({
      spaceId: 's1',
      contactId: 'c1',
      channel: 'email',
      replyText: 'Tue 11am',
    });
    expect(result.action).toBe('skipped');
    expect(result.sent).toBe(false);
    expect(insertedDraft).toBeNull();
    expect(sendSMS).not.toHaveBeenCalled();
  });
});

describe('draft markers', () => {
  it('distinguishes first-touch from the reply draft', () => {
    expect(isFirstTouchDraft({ reasoning: FIRST_TOUCH_REASON })).toBe(true);
    expect(isFirstTouchReplyDraft({ reasoning: FIRST_TOUCH_REASON })).toBe(false);
    expect(isFirstTouchReplyDraft({ reasoning: REPLY_REASON })).toBe(true);
    expect(extractWindowLabels(FIRST_TOUCH_BODY)).toEqual(['Tue 11am', 'Wed 4pm']);
  });
});
