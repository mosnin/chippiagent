/**
 * Tests for `lib/integrations/agent-tools.ts` — the module that turns a
 * realtor's connected Composio toolkits into callable agent tools.
 *
 * The safety-critical surface here is `actionNeedsApproval`: it decides
 * whether a Composio action fires silently or pauses for the realtor's
 * yes. A false negative posts to their LinkedIn without consent, so the
 * discovery rule is covered hard. `buildComposioAgentTools` orchestration
 * (empty connections → empty list, per-toolkit isolation) is covered too.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { activeToolkitsMock, getComposioMock, getRawComposioToolsMock, loggerWarnMock } =
  vi.hoisted(() => ({
    activeToolkitsMock: vi.fn(),
    getComposioMock: vi.fn(),
    getRawComposioToolsMock: vi.fn(),
    loggerWarnMock: vi.fn(),
  }));

vi.mock('@/lib/integrations/connections', () => ({
  activeToolkits: activeToolkitsMock,
}));

vi.mock('@/lib/integrations/composio', () => ({
  getComposio: getComposioMock,
  // executeToolForEntity is lazy-imported inside the handler; not needed here.
  executeToolForEntity: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: loggerWarnMock, info: vi.fn(), debug: vi.fn() },
}));

import {
  actionNeedsApproval,
  buildComposioAgentTools,
  buildToolkitAgentTools,
} from '@/lib/integrations/agent-tools';

beforeEach(() => {
  vi.clearAllMocks();
  getComposioMock.mockReturnValue({
    tools: { getRawComposioTools: getRawComposioToolsMock },
  });
  getRawComposioToolsMock.mockResolvedValue([]);
  activeToolkitsMock.mockResolvedValue([]);
});

describe('actionNeedsApproval — the gate that protects the realtor', () => {
  it('gates EVERY action in a social toolkit, even reads', () => {
    // linkedin is category 'social' in the catalog — a read still gets
    // gated because the surface itself is public-facing.
    expect(actionNeedsApproval('LINKEDIN_GET_MY_INFO', 'linkedin')).toBe(true);
    expect(actionNeedsApproval('LINKEDIN_CREATE_LINKED_IN_POST', 'linkedin')).toBe(true);
    expect(actionNeedsApproval('REDDIT_SEARCH', 'reddit')).toBe(true);
  });

  it('gates EVERY action in a messaging toolkit', () => {
    // slack, twilio, discord are category 'messaging'.
    expect(actionNeedsApproval('SLACK_LIST_CHANNELS', 'slack')).toBe(true);
    expect(actionNeedsApproval('TWILIO_SEND_SMS', 'twilio')).toBe(true);
  });

  it('gates public-action verbs in NON-social toolkits (post/send/publish/etc.)', () => {
    // gmail is 'email' — not always-gated — but a send must still gate.
    expect(actionNeedsApproval('GMAIL_SEND_EMAIL', 'gmail')).toBe(true);
    expect(actionNeedsApproval('HUBSPOT_CREATE_POST', 'hubspot')).toBe(true);
    expect(actionNeedsApproval('NOTION_CREATE_COMMENT', 'notion')).toBe(true);
  });

  it('does NOT gate read-only actions in non-social toolkits', () => {
    expect(actionNeedsApproval('GMAIL_FETCH_EMAILS', 'gmail')).toBe(false);
    expect(actionNeedsApproval('HUBSPOT_GET_CONTACT', 'hubspot')).toBe(false);
    expect(actionNeedsApproval('GOOGLESHEETS_GET_VALUES', 'googlesheets')).toBe(false);
  });

  it('matches the public-action segment case-insensitively', () => {
    expect(actionNeedsApproval('gmail_send_email', 'gmail')).toBe(true);
  });
});

describe('buildToolkitAgentTools — one toolkit → SDK tools', () => {
  it('wraps each raw Composio action as a named SDK tool', async () => {
    getRawComposioToolsMock.mockResolvedValue([
      {
        slug: 'GMAIL_SEND_EMAIL',
        name: 'Send Email',
        description: 'Send an email from the connected Gmail account.',
        inputParameters: {
          type: 'object',
          properties: { to: { type: 'string' }, body: { type: 'string' } },
          required: ['to'],
        },
      },
      { slug: 'GMAIL_FETCH_EMAILS', description: 'Fetch emails.' },
    ]);

    const tools = await buildToolkitAgentTools({ toolkit: 'gmail', userId: 'u_1' });

    expect(tools).toHaveLength(2);
    // Slug lowercased for the SDK name.
    expect(tools.map((t) => (t as { name: string }).name)).toEqual([
      'gmail_send_email',
      'gmail_fetch_emails',
    ]);
    // limit:1000 so large toolkits aren't silently truncated at 20.
    expect(getRawComposioToolsMock).toHaveBeenCalledWith({
      toolkits: ['gmail'],
      limit: 1000,
    });
  });

  it('throws the raw Composio error so the caller can reconcile the row', async () => {
    const err = Object.assign(new Error('account gone'), {
      name: 'ComposioConnectedAccountNotFoundError',
    });
    getRawComposioToolsMock.mockRejectedValue(err);
    await expect(buildToolkitAgentTools({ toolkit: 'gmail', userId: 'u_1' })).rejects.toBe(err);
  });
});

describe('buildComposioAgentTools — orchestration', () => {
  it('returns [] when the realtor has no connected toolkits', async () => {
    activeToolkitsMock.mockResolvedValue([]);
    const tools = await buildComposioAgentTools('s_1', 'u_1');
    expect(tools).toEqual([]);
    expect(getRawComposioToolsMock).not.toHaveBeenCalled();
  });

  it('returns [] (chat survives) when the toolkit lookup itself throws', async () => {
    activeToolkitsMock.mockRejectedValue(new Error('db down'));
    const tools = await buildComposioAgentTools('s_1', 'u_1');
    expect(tools).toEqual([]);
    expect(loggerWarnMock).toHaveBeenCalled();
  });

  it('one sick toolkit is dropped — the rest still load', async () => {
    activeToolkitsMock.mockResolvedValue(['gmail', 'slack']);
    getRawComposioToolsMock.mockImplementation(async ({ toolkits }: { toolkits: string[] }) => {
      if (toolkits.includes('gmail')) throw new Error('composio 503');
      return [{ slug: 'SLACK_SEND_MESSAGE', description: 'Post a message.' }];
    });

    const tools = await buildComposioAgentTools('s_1', 'u_1');

    expect(tools).toHaveLength(1);
    expect((tools[0] as { name: string }).name).toBe('slack_send_message');
    expect(loggerWarnMock).toHaveBeenCalled();
  });
});
