import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendSMS = vi.fn();

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

beforeEach(() => {
  tables = {};
  insertedDraft = null;
  updatedDraft = null;
  sendSMS.mockReset();
});

describe('first-touch source invariants', () => {
  it('never imports a sender and never writes status=sent', () => {
    expect(SOURCE).not.toMatch(/sendSMS|send_sms|\/api\/agent\/send|from '@\/lib\/sms'|from '@\/lib\/delivery'/);
    expect(SOURCE).not.toMatch(/status:\s*['"]sent['"]/);
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
    expect(text).not.toMatch(/\bsent\b/i);
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
});

describe('draftFirstTouchForLead', () => {
  function seedHappyPath() {
    tables = {
      Contact: {
        single: {
          id: 'c1',
          name: 'Sam Rivera',
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

  it('inserts a pending SMS and never sends', async () => {
    seedHappyPath();
    const result = await draftFirstTouchForLead({
      spaceId: 's1',
      contactId: 'c1',
      now: new Date('2026-08-21T14:00:00Z'),
    });
    expect(result.sent).toBe(false);
    expect(result.status).toBe('pending');
    expect(result.channel).toBe('sms');
    expect(result.action).toBe('drafted');
    expect(result.content.trim().length).toBeGreaterThan(0);
    expect(result.windows).toHaveLength(2);
    expect(result.content).toContain(result.windows[0]);
    expect(result.content).toContain(result.windows[1]);
    expect(result.content).toContain('Jordan');
    expect(insertedDraft).toMatchObject({
      spaceId: 's1',
      contactId: 'c1',
      channel: 'sms',
      status: 'pending',
    });
    expect(insertedDraft?.status).not.toBe('sent');
    expect(sendSMS).not.toHaveBeenCalled();
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

  it('returns an existing non-empty pending draft instead of sending a new one', async () => {
    seedHappyPath();
    tables.AgentDraft = {
      rows: [{ id: 'd_old', content: 'Hey Sam, this is Jordan. I can do Tue 11am or Wed 4pm — which works?', status: 'pending', channel: 'sms' }],
    };
    const result = await draftFirstTouchForLead({ spaceId: 's1', contactId: 'c1' });
    expect(result.action).toBe('deduped');
    expect(result.draftId).toBe('d_old');
    expect(result.sent).toBe(false);
    expect(insertedDraft).toBeNull();
    expect(sendSMS).not.toHaveBeenCalled();
  });

  it('fills an empty pending stub so the draft becomes real', async () => {
    seedHappyPath();
    tables.AgentDraft = {
      rows: [{ id: 'd_empty', content: '   ', status: 'pending', channel: 'sms' }],
    };
    const result = await draftFirstTouchForLead({
      spaceId: 's1',
      contactId: 'c1',
      now: new Date('2026-08-21T14:00:00Z'),
    });
    expect(result.action).toBe('filled');
    expect(result.draftId).toBe('d_empty');
    expect(result.content.trim().length).toBeGreaterThan(0);
    expect(result.status).toBe('pending');
    expect(result.sent).toBe(false);
    expect(updatedDraft?.content).toBe(result.content);
    expect(updatedDraft?.status).toBe('pending');
    expect(sendSMS).not.toHaveBeenCalled();
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
