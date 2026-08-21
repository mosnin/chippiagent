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
        data: override.insertError ? null : { id: (row.id as string) ?? 'draft_1' },
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
  assertValidFirstTouchText,
  composeFirstTouchSms,
  draftFirstTouchForLead,
  firstNameOf,
  formatWindowLabel,
  isInboundFirstTouchEvent,
  normalizeTone,
  proposeTwoShowingWindows,
} from '@/lib/agent/first-touch';
import { INBOUND_LEAD_EVENTS } from '@/lib/agent/trigger-policy';

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../lib/agent/first-touch.ts'),
  'utf8',
);

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

describe('first-touch source invariants', () => {
  it('sends through Telnyx and never persists pending', () => {
    expect(SOURCE).toMatch(/from '@\/lib\/sms'/);
    expect(SOURCE).toMatch(/sendSMS/);
    expect(SOURCE).toMatch(/status:\s*['"]sent['"]/);
    expect(SOURCE).not.toMatch(/status:\s*['"]pending['"]/);
    expect(SOURCE).not.toMatch(/awaiting approval|Never sent|draft parked/i);
    expect(SOURCE).not.toMatch(/book_tour|from\(['"]Tour['"]\)/);
    expect(SOURCE).not.toMatch(/Chippy/);
  });
});

describe('inbound first-touch events', () => {
  it('wakes on new_lead and application_submitted only', () => {
    expect(INBOUND_LEAD_EVENTS).toEqual(['new_lead', 'application_submitted']);
    expect(isInboundFirstTouchEvent('new_lead')).toBe(true);
    expect(isInboundFirstTouchEvent('application_submitted')).toBe(true);
    expect(isInboundFirstTouchEvent('tour_completed')).toBe(false);
    expect(isInboundFirstTouchEvent('inbound_message')).toBe(false);
  });
});

describe('proposeTwoShowingWindows', () => {
  it('returns two concrete future weekday windows', () => {
    const now = new Date('2026-08-21T14:00:00Z'); // Friday afternoon UTC
    const windows = proposeTwoShowingWindows(now, { timeZone: 'UTC', startHour: 9, endHour: 17 });
    expect(windows).toHaveLength(2);
    expect(windows[0].label).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) /);
    expect(windows[1].label).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) /);
    expect(windows[0].label).not.toEqual(windows[1].label);
    expect(windows[0].startsAt.getTime()).toBeGreaterThan(now.getTime());
    expect(windows[1].startsAt.getTime()).toBeGreaterThan(windows[0].startsAt.getTime());
  });
});

describe('composeFirstTouchSms', () => {
  const windows = [
    { startsAt: new Date('2026-08-25T15:00:00Z'), label: 'Tue 11am' },
    { startsAt: new Date('2026-08-26T20:00:00Z'), label: 'Wed 4pm' },
  ];

  it('fails if a window is missing or the body is empty', () => {
    expect(() =>
      composeFirstTouchSms({
        contactFirstName: 'Sam',
        voice: { tone: 'warm', agentFirstName: 'Jordan' },
        windows: [windows[0]],
      }),
    ).toThrow(/two showing windows/);
    expect(() =>
      assertValidFirstTouchText('', {
        windows: ['Tue 11am', 'Wed 4pm'],
        agentToken: 'Jordan',
        tone: 'warm',
      }),
    ).toThrow(/empty/);
  });

  it('writes a short warm text in the assigned agent voice with both windows', () => {
    const text = composeFirstTouchSms({
      contactFirstName: 'Sam Rivera',
      voice: { tone: 'warm', agentFirstName: 'Jordan Lee', businessName: 'Pine Realty' },
      windows,
      property: '1422 Pine',
    });
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('Sam');
    expect(text).toContain('Jordan');
    expect(text).toContain('Tue 11am');
    expect(text).toContain('Wed 4pm');
    expect(text).toContain('1422 Pine');
    expect(text).toMatch(/this is/i);
    expect(text).not.toMatch(/chippy/i);
    expect(text).not.toMatch(/\b(sent|booked|live|reserved|locked)\b/i);
  });

  it('keeps direct / formal / casual distinct from each other', () => {
    const base = {
      contactFirstName: 'Sam',
      windows,
      property: '1422 Pine',
    };
    const direct = composeFirstTouchSms({
      ...base,
      voice: { tone: 'direct', agentFirstName: 'Jordan' },
    });
    const formal = composeFirstTouchSms({
      ...base,
      voice: { tone: 'formal', agentFirstName: 'Jordan', businessName: 'Pine Realty' },
    });
    const casual = composeFirstTouchSms({
      ...base,
      voice: { tone: 'casual', agentFirstName: 'Jordan' },
    });
    expect(direct).toMatch(/i can hold/i);
    expect(formal).toMatch(/would you prefer/i);
    expect(casual).toMatch(/work for me/i);
    expect(direct).not.toEqual(formal);
    expect(formal).not.toEqual(casual);
  });

  it('rejects a draft that claims it already sent', () => {
    expect(() =>
      assertValidFirstTouchText('Hi Sam — sent this automatically. Tue 11am or Wed 4pm.', {
        windows: ['Tue 11am', 'Wed 4pm'],
        agentToken: 'Jordan',
        tone: 'direct',
      }),
    ).toThrow(/sent/);
  });

  it('rejects a draft that claims the showing is booked or live', () => {
    expect(() =>
      assertValidFirstTouchText('Hey Sam, this is Jordan. Tue 11am is booked. Wed 4pm.', {
        windows: ['Tue 11am', 'Wed 4pm'],
        agentToken: 'Jordan',
        tone: 'warm',
      }),
    ).toThrow(/booked/);
    expect(() =>
      assertValidFirstTouchText('Hey Sam, this is Jordan. Showing is live. Tue 11am or Wed 4pm.', {
        windows: ['Tue 11am', 'Wed 4pm'],
        agentToken: 'Jordan',
        tone: 'warm',
      }),
    ).toThrow(/booked/);
  });
});

describe('draftFirstTouchForLead', () => {
  function seedHappyPath() {
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
      AgentDraft: { rows: [] },
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

  it('sends the SMS through Telnyx and records it as sent', async () => {
    seedHappyPath();
    const result = await draftFirstTouchForLead({
      spaceId: 's1',
      contactId: 'c1',
      now: new Date('2026-08-21T14:00:00Z'),
    });
    expect(result.sent).toBe(true);
    expect(result.status).toBe('sent');
    expect(result.channel).toBe('sms');
    expect(result.action).toBe('sent');
    expect(result.content.trim().length).toBeGreaterThan(0);
    expect(result.windows).toHaveLength(2);
    expect(result.content).toContain(result.windows[0]);
    expect(result.content).toContain(result.windows[1]);
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
      draftFirstTouchForLead({
        spaceId: 's1',
        contactId: 'c1',
        now: new Date('2026-08-21T14:00:00Z'),
      }),
    ).rejects.toThrow(/Telnyx credentials missing/);
    expect(insertedDraft).toBeNull();
    expect(updatedDraft).toBeNull();
  });

  it('fails with a real error when the send path returns false — never parks pending', async () => {
    seedHappyPath();
    sendSMS.mockResolvedValue(false);
    await expect(
      draftFirstTouchForLead({
        spaceId: 's1',
        contactId: 'c1',
        now: new Date('2026-08-21T14:00:00Z'),
      }),
    ).rejects.toThrow(/SMS send failed/);
    expect(sendSMS).toHaveBeenCalled();
    expect(insertedDraft).toBeNull();
  });

  it('fails closed when the draft would be empty', async () => {
    seedHappyPath();
    tables.Contact = { single: { id: 'c1', name: '', spaceId: 's1' } };
    tables.AIUserProfile = { single: { displayName: '', communicationTone: 'warm' } };
    // compose still produces a body from fallbacks — force windows failure instead
    tables.SpaceSetting = {
      single: {
        timezone: 'UTC',
        tourStartHour: 0,
        tourEndHour: 0,
        tourDaysAvailable: [],
      },
    };
    await expect(
      draftFirstTouchForLead({ spaceId: 's1', contactId: 'c1', now: new Date('2026-08-21T14:00:00Z') }),
    ).rejects.toThrow(/two showing windows|empty|not in the/);
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('returns an existing sent SMS instead of sending a second one', async () => {
    seedHappyPath();
    tables.AgentDraft = {
      rows: [
        {
          id: 'd_old',
          content: 'Hey Sam, this is Jordan. I can do Tue 11am or Wed 4pm — which works?',
          status: 'sent',
          channel: 'sms',
          reasoning: 'First-touch SMS for a new inbound lead — two showing windows. Sent.',
        },
      ],
    };
    const result = await draftFirstTouchForLead({ spaceId: 's1', contactId: 'c1' });
    expect(result.action).toBe('deduped');
    expect(result.draftId).toBe('d_old');
    expect(result.sent).toBe(true);
    expect(result.status).toBe('sent');
    expect(insertedDraft).toBeNull();
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('does not treat a leftover pending row as done — it must send', async () => {
    seedHappyPath();
    tables.AgentDraft = {
      rows: [
        {
          id: 'd_old',
          content: 'Hey Sam, this is Jordan. I can do Tue 11am or Wed 4pm — which works?',
          status: 'pending',
          channel: 'sms',
          reasoning: 'First-touch SMS for a new inbound lead — two showing windows. Sent.',
        },
      ],
    };
    const result = await draftFirstTouchForLead({
      spaceId: 's1',
      contactId: 'c1',
      now: new Date('2026-08-21T14:00:00Z'),
    });
    expect(result.sent).toBe(true);
    expect(result.status).toBe('sent');
    expect(sendSMS).toHaveBeenCalled();
    expect(insertedDraft?.status).toBe('sent');
    expect(insertedDraft?.status).not.toBe('pending');
  });

  it('fills an empty stub after a real send', async () => {
    seedHappyPath();
    tables.AgentDraft = {
      rows: [
        {
          id: 'd_empty',
          content: '   ',
          status: 'pending',
          channel: 'sms',
          reasoning: 'First-touch SMS for a new inbound lead — two showing windows. Sent.',
        },
      ],
    };
    const result = await draftFirstTouchForLead({
      spaceId: 's1',
      contactId: 'c1',
      now: new Date('2026-08-21T14:00:00Z'),
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
});

describe('helpers', () => {
  it('normalizes tone and first names', () => {
    expect(normalizeTone('DIRECT')).toBe('direct');
    expect(normalizeTone('nope')).toBe('warm');
    expect(firstNameOf('Jordan Lee')).toBe('Jordan');
    expect(firstNameOf('  ')).toBe('there');
  });

  it('formats a compact window label', () => {
    expect(formatWindowLabel(new Date('2026-08-25T15:00:00Z'), 'UTC')).toMatch(/Tue 3pm/);
  });
});
