/**
 * Unit tests for `shapeProposals` — the pure shaping/sanitization layer.
 * No DB, no network. Walks the registry only via getTool, which is real.
 *
 * Covers: empty/garbage input, allowlist enforcement, dedupe, MAX cap,
 * mutates flag mapping. Also covers humanSummary formatting + the batched
 * attachHumanSummaries helper (with a fake supabase client).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  shapeProposals,
  MAX_PROPOSALS,
  formatHumanSummary,
  attachHumanSummaries,
  prettifyWhen,
  buildSystemPrompt,
  realtorVerbForToolkit,
  doneVerbForToolkit,
  type ProposedAction,
  type IntegrationToolSpec,
} from '@/lib/chippi/post-tour';

describe('shapeProposals', () => {
  it('returns [] for non-object input', () => {
    expect(shapeProposals(null)).toEqual([]);
    expect(shapeProposals('nope')).toEqual([]);
    expect(shapeProposals(42)).toEqual([]);
  });

  it('returns [] for malformed proposal arrays', () => {
    expect(shapeProposals({ proposals: 'wrong' })).toEqual([]);
    expect(shapeProposals({ wrong_key: [] })).toEqual([]);
  });

  it('drops tools outside the post-tour allowlist', () => {
    const out = shapeProposals({
      proposals: [
        { tool: 'find_property', args: {} }, // not on allowlist
        { tool: 'pipeline_summary', args: {} }, // not on allowlist
        { tool: 'log_call', args: { personId: 'abc12345', summary: 'Tour' } },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].tool).toBe('log_call');
  });

  it('de-dupes identical (tool, args) pairs across orderings', () => {
    const out = shapeProposals({
      proposals: [
        { tool: 'log_call', args: { personId: 'p1', summary: 'X' } },
        { tool: 'log_call', args: { summary: 'X', personId: 'p1' } }, // same content, different key order
        { tool: 'log_call', args: { personId: 'p1', summary: 'Y' } }, // different summary, kept
      ],
    });
    expect(out.map((o) => o.args.summary)).toEqual(['X', 'Y']);
  });

  it('caps at MAX_PROPOSALS', () => {
    const proposals = Array.from({ length: 10 }, (_, i) => ({
      tool: 'note_on_person',
      args: { personId: `p${i}`, content: `note ${i}` },
    }));
    const out = shapeProposals({ proposals });
    expect(out.length).toBe(MAX_PROPOSALS);
  });

  it('flags mutating tools and read-only tools correctly', () => {
    const out = shapeProposals({
      proposals: [
        { tool: 'log_call', args: { personId: 'p1', summary: 'X' } }, // mutating
        { tool: 'draft_email', args: { personId: 'p1', intent: 'check-in' } }, // read-only
      ],
    });
    expect(out).toHaveLength(2);
    expect(out.find((o) => o.tool === 'log_call')?.mutates).toBe(true);
    expect(out.find((o) => o.tool === 'draft_email')?.mutates).toBe(false);
  });

  it('produces a summary string for each proposal', () => {
    const out = shapeProposals({
      proposals: [
        { tool: 'mark_person_hot', args: { personId: '12345678abcd', why: 'wants to offer' } },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].summary).toBeTruthy();
    expect(out[0].summary.length).toBeGreaterThan(0);
  });
});

// ─── humanSummary formatting ─────────────────────────────────────────────

function makeProposal(tool: string, args: Record<string, unknown>): ProposedAction {
  return {
    tool: tool as ProposedAction['tool'],
    args,
    summary: 'unused',
    mutates: true,
  };
}

const PEOPLE = new Map([
  ['p1', 'Sam Chen'],
  ['p2', 'Jordan Bell'],
]);
const DEALS = new Map([['d1', '412 Elm']]);

describe('formatHumanSummary', () => {
  it('log_call uses the contact name and quotes the summary', () => {
    const s = formatHumanSummary(
      makeProposal('log_call', { personId: 'p1', summary: 'loved it' }),
      PEOPLE,
      DEALS,
    );
    expect(s).toBe('Log Sam Chen\'s call: "loved it"');
  });

  it('log_meeting includes the location when present', () => {
    const s = formatHumanSummary(
      makeProposal('log_meeting', { personId: 'p1', summary: 'walkthrough', location: '412 Elm' }),
      PEOPLE,
      DEALS,
    );
    expect(s).toBe('Log Sam Chen\'s meeting at 412 Elm: "walkthrough"');
  });

  it('note_on_person uses the contact name', () => {
    const s = formatHumanSummary(
      makeProposal('note_on_person', { personId: 'p1', content: 'wife worried about schools' }),
      PEOPLE,
      DEALS,
    );
    expect(s).toBe('Note on Sam Chen: "wife worried about schools"');
  });

  it('note_on_deal uses the deal title', () => {
    const s = formatHumanSummary(
      makeProposal('note_on_deal', { dealId: 'd1', content: 'price talk' }),
      PEOPLE,
      DEALS,
    );
    expect(s).toBe('Note on 412 Elm: "price talk"');
  });

  it('mark_person_hot uses the contact name and the reason', () => {
    const s = formatHumanSummary(
      makeProposal('mark_person_hot', { personId: 'p1', why: 'made offer' }),
      PEOPLE,
      DEALS,
    );
    expect(s).toBe('Mark Sam Chen hot — made offer');
  });

  it('mark_person_cold uses the contact name and the reason', () => {
    const s = formatHumanSummary(
      makeProposal('mark_person_cold', { personId: 'p2', why: 'lost interest' }),
      PEOPLE,
      DEALS,
    );
    expect(s).toBe('Mark Jordan Bell cold — lost interest');
  });

  it('set_followup prettifies an ISO date and uses the contact name', () => {
    const s = formatHumanSummary(
      makeProposal('set_followup', { personId: 'p1', when: '2026-05-08' }),
      PEOPLE,
      DEALS,
    );
    // "May 8" within the same year — no year suffix.
    expect(s).toBe('Follow up with Sam Chen on May 8');
  });

  it('set_followup capitalises a weekday phrase', () => {
    const s = formatHumanSummary(
      makeProposal('set_followup', { personId: 'p1', when: 'friday' }),
      PEOPLE,
      DEALS,
    );
    expect(s).toBe('Follow up with Sam Chen on Friday');
  });

  it('draft_email reads naturally', () => {
    const s = formatHumanSummary(
      makeProposal('draft_email', { personId: 'p1', intent: 'check-in' }),
      PEOPLE,
      DEALS,
    );
    expect(s).toBe('Draft a check-in email to Sam Chen');
  });

  it('draft_sms reads naturally', () => {
    const s = formatHumanSummary(
      makeProposal('draft_sms', { personId: 'p2', intent: 'reach-out' }),
      PEOPLE,
      DEALS,
    );
    expect(s).toBe('Draft a reach-out text to Jordan Bell');
  });

  it('returns null when the person id resolves to no name', () => {
    const s = formatHumanSummary(
      makeProposal('log_call', { personId: 'unknown', summary: 'x' }),
      PEOPLE,
      DEALS,
    );
    expect(s).toBeNull();
  });
});

// ─── Integration tools (Composio bridge) ─────────────────────────────────

describe('shapeProposals — integration tools', () => {
  const GMAIL: IntegrationToolSpec = {
    slug: 'GMAIL_SEND_EMAIL',
    description: 'Send an email through the user\'s Gmail account.',
    toolkit: 'gmail',
  };
  const GCAL: IntegrationToolSpec = {
    slug: 'GOOGLECALENDAR_CREATE_EVENT',
    description: 'Create a calendar event in the user\'s Google Calendar.',
    toolkit: 'googlecalendar',
  };

  it('keeps integration slugs that match the realtor\'s connected apps', () => {
    const out = shapeProposals(
      {
        proposals: [
          { tool: 'GMAIL_SEND_EMAIL', args: { to: 'sam@chen.com', subject: 'Tour follow-up', body: 'Loved meeting you' } },
        ],
      },
      { integrationTools: [GMAIL] },
    );
    expect(out).toHaveLength(1);
    expect(out[0].tool).toBe('GMAIL_SEND_EMAIL');
    expect(out[0].integrationToolkit).toBe('gmail');
    expect(out[0].mutates).toBe(true);
  });

  it('drops integration slugs the realtor has NOT connected', () => {
    // Model hallucinated an Outlook tool but only Gmail is connected.
    const out = shapeProposals(
      { proposals: [{ tool: 'OUTLOOK_SEND_EMAIL', args: {} }] },
      { integrationTools: [GMAIL] },
    );
    expect(out).toHaveLength(0);
  });

  it('keeps native and integration tools side by side', () => {
    const out = shapeProposals(
      {
        proposals: [
          { tool: 'log_call', args: { personId: 'p1', summary: 'tour' } },
          { tool: 'GMAIL_SEND_EMAIL', args: { to: 'sam@chen.com' } },
          { tool: 'GOOGLECALENDAR_CREATE_EVENT', args: { summary: 'follow-up tour' } },
        ],
      },
      { integrationTools: [GMAIL, GCAL] },
    );
    expect(out).toHaveLength(3);
    expect(out[0].tool).toBe('log_call');
    expect(out[0].integrationToolkit).toBeUndefined();
    expect(out[1].integrationToolkit).toBe('gmail');
    expect(out[2].integrationToolkit).toBe('googlecalendar');
  });

  it('produces a clean realtor-voice summary without "via Gmail"', () => {
    const out = shapeProposals(
      { proposals: [{ tool: 'GMAIL_SEND_EMAIL', args: { to: 'sam@chen.com' } }] },
      { integrationTools: [GMAIL] },
    );
    expect(out[0].summary).not.toMatch(/via gmail/i);
    // Verb is the truth: "Email" tells the realtor what's happening.
    expect(out[0].summary).toMatch(/^Email/);
  });

  it('default behavior is unchanged when no integration tools are passed', () => {
    // The graceful-degradation guarantee: same input + no toolkits === today's behavior.
    const proposals = {
      proposals: [
        { tool: 'log_call', args: { personId: 'p1', summary: 'tour' } },
        { tool: 'GMAIL_SEND_EMAIL', args: { to: 'sam@chen.com' } }, // dropped: nothing connected
      ],
    };
    const out = shapeProposals(proposals);
    expect(out).toHaveLength(1);
    expect(out[0].tool).toBe('log_call');
  });
});

describe('buildSystemPrompt — integration catalog', () => {
  const GMAIL: IntegrationToolSpec = {
    slug: 'GMAIL_SEND_EMAIL',
    description: 'Send an email through Gmail.',
    toolkit: 'gmail',
  };

  it('omits the connected-apps section entirely when no integrations are passed', () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).not.toMatch(/Connected-app tools/);
  });

  it('renders the connected-apps block when integration tools are present', () => {
    const prompt = buildSystemPrompt([], [GMAIL]);
    expect(prompt).toMatch(/Connected-app tools/);
    expect(prompt).toMatch(/GMAIL_SEND_EMAIL/);
  });

  it('tells the model to prefer connected-app tools when intent is to actually send', () => {
    const prompt = buildSystemPrompt([], [GMAIL]);
    expect(prompt).toMatch(/prefer the connected-app tool/);
  });
});

describe('realtorVerbForToolkit / doneVerbForToolkit', () => {
  it('returns concise verbs for known toolkits', () => {
    expect(realtorVerbForToolkit('gmail')).toBe('Email');
    expect(realtorVerbForToolkit('googlecalendar')).toBe('Add to calendar');
    expect(doneVerbForToolkit('gmail')).toBe('email sent');
    expect(doneVerbForToolkit('googlecalendar')).toBe('on the calendar');
  });

  it('falls back gracefully for unknown toolkits', () => {
    expect(realtorVerbForToolkit('weird-app')).toBe('Run connected action');
    expect(doneVerbForToolkit('weird-app')).toBe('weird-app fired');
  });

  it('doneVerbForToolkit returns null when toolkit is missing', () => {
    expect(doneVerbForToolkit(undefined)).toBeNull();
  });
});

describe('formatHumanSummary — integration proposals', () => {
  it('uses the toolkit verb and the resolved person name', () => {
    const proposal: ProposedAction = {
      tool: 'GMAIL_SEND_EMAIL',
      args: { personId: 'p1' },
      summary: 'Email sam@chen.com',
      mutates: true,
      integrationToolkit: 'gmail',
    };
    const s = formatHumanSummary(proposal, PEOPLE, DEALS);
    expect(s).toBe('Email to Sam Chen');
  });

  it('falls back to the recipient hint when no personId is set', () => {
    const proposal: ProposedAction = {
      tool: 'GMAIL_SEND_EMAIL',
      args: { to: 'sam@chen.com' },
      summary: 'Email sam@chen.com',
      mutates: true,
      integrationToolkit: 'gmail',
    };
    const s = formatHumanSummary(proposal, PEOPLE, DEALS);
    expect(s).toBe('Email to sam@chen.com');
  });

  it('never inserts "via Gmail" — the verb is the truth', () => {
    const proposal: ProposedAction = {
      tool: 'GMAIL_SEND_EMAIL',
      args: { personId: 'p1' },
      summary: '',
      mutates: true,
      integrationToolkit: 'gmail',
    };
    const s = formatHumanSummary(proposal, PEOPLE, DEALS);
    expect(s).not.toMatch(/via gmail/i);
  });
});

describe('prettifyWhen', () => {
  it('renders ISO same-year as "Mon D"', () => {
    expect(prettifyWhen('2026-05-08', new Date('2026-01-01'))).toBe('May 8');
  });
  it('includes the year on cross-year dates', () => {
    expect(prettifyWhen('2027-01-12', new Date('2026-05-01'))).toBe('Jan 12, 2027');
  });
  it('capitalises bare weekdays', () => {
    expect(prettifyWhen('next tuesday')).toBe('Next Tuesday');
    expect(prettifyWhen('friday')).toBe('Friday');
  });
});

describe('attachHumanSummaries', () => {
  it('does ONE Contact read and ONE Deal read for the whole batch', async () => {
    // Tally the queries the helper issues.
    const queriesByTable: Record<string, number> = { Contact: 0, Deal: 0 };
    const fakeSupabase = {
      from(table: string) {
        queriesByTable[table] = (queriesByTable[table] ?? 0) + 1;
        const builder = {
          _data: [] as Array<Record<string, unknown>>,
          select(_cols: string) { return builder; },
          eq(_col: string, _val: unknown) { return builder; },
          in(_col: string, ids: string[]) {
            if (table === 'Contact') {
              builder._data = ids
                .filter((id) => PEOPLE.has(id))
                .map((id) => ({ id, name: PEOPLE.get(id)! }));
            } else if (table === 'Deal') {
              builder._data = ids
                .filter((id) => DEALS.has(id))
                .map((id) => ({ id, title: DEALS.get(id)! }));
            }
            return Promise.resolve({ data: builder._data, error: null });
          },
        };
        return builder;
      },
    };

    const proposals: ProposedAction[] = [
      makeProposal('log_call', { personId: 'p1', summary: 'loved it' }),
      makeProposal('mark_person_hot', { personId: 'p2', why: 'made offer' }),
      makeProposal('set_followup', { personId: 'p1', when: '2026-05-08' }),
      makeProposal('note_on_deal', { dealId: 'd1', content: 'price talk' }),
    ];

    const out = await attachHumanSummaries(fakeSupabase as never, 'space_1', proposals);

    expect(queriesByTable.Contact).toBe(1);
    expect(queriesByTable.Deal).toBe(1);

    expect(out[0].humanSummary).toContain('Sam Chen');
    expect(out[1].humanSummary).toContain('Jordan Bell');
    expect(out[2].humanSummary).toContain('Sam Chen');
    expect(out[3].humanSummary).toContain('412 Elm');
  });

  it('skips reads for tables it doesn\'t need', async () => {
    const calls: string[] = [];
    const fakeSupabase = {
      from(table: string) {
        calls.push(table);
        return {
          select() { return this; },
          eq() { return this; },
          in() { return Promise.resolve({ data: [], error: null }); },
        };
      },
    };
    const out = await attachHumanSummaries(
      fakeSupabase as never,
      'space_1',
      [makeProposal('log_call', { personId: 'p1', summary: 'x' })],
    );
    expect(calls).toEqual(['Contact']); // no Deal read needed
    expect(out).toHaveLength(1);
  });

  it('returns proposals unchanged when none reference any id', async () => {
    const fakeSupabase = { from: vi.fn() };
    const out = await attachHumanSummaries(
      fakeSupabase as never,
      'space_1',
      [makeProposal('log_call', { summary: 'no person id' })],
    );
    expect(fakeSupabase.from).not.toHaveBeenCalled();
    expect(out[0].humanSummary).toBeUndefined();
  });

  it('falls back gracefully when an id has no resolved row', async () => {
    const fakeSupabase = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          in() { return Promise.resolve({ data: [], error: null }); },
        };
      },
    };
    const out = await attachHumanSummaries(
      fakeSupabase as never,
      'space_1',
      [makeProposal('log_call', { personId: 'missing', summary: 'x' })],
    );
    expect(out[0].humanSummary).toBeUndefined();
  });
});
