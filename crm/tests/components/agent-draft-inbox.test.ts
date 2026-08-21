/**
 * The drafts inbox is a sent/failed log. These tests pin the contract that
 * this surface cannot gate a send: it never fetches pending rows, never
 * PATCHes a draft, and never asks the realtor to approve.
 *
 * No render — the project doesn't ship jsdom. Helpers + source invariants.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  AgentDraftInbox,
  DRAFT_LOG_FETCH_STATUSES,
  DRAFTS_INBOX_COPY,
  DRAFTS_PAGE_COPY,
  draftInboxCanGateSend,
  draftLogFetchUrls,
  draftLogLabel,
  draftLogOutcome,
  isDraftLogRow,
  mergeDraftLog,
  type AgentDraft,
} from '@/components/agent/agent-draft-inbox';

const INBOX_SRC = readFileSync(
  resolve(process.cwd(), 'components/agent/agent-draft-inbox.tsx'),
  'utf8',
);
const PAGE_SRC = readFileSync(
  resolve(process.cwd(), 'app/s/[slug]/chippi/drafts/page.tsx'),
  'utf8',
);

function draft(partial: Partial<AgentDraft> & Pick<AgentDraft, 'id' | 'status'>): AgentDraft {
  return {
    contactId: null,
    dealId: null,
    channel: 'sms',
    subject: null,
    content: 'Hi',
    reasoning: null,
    priority: 0,
    confidence: null,
    createdAt: '2026-08-21T00:00:00.000Z',
    expiresAt: null,
    Contact: null,
    ...partial,
  };
}

describe('AgentDraftInbox — cannot gate a send', () => {
  it('exports the inbox component', () => {
    expect(typeof AgentDraftInbox).toBe('function');
  });

  it('declares that this surface cannot hold a send', () => {
    expect(draftInboxCanGateSend()).toBe(false);
  });

  it('fetches only sent and delivery-miss rows — never pending', () => {
    expect(DRAFT_LOG_FETCH_STATUSES).toEqual(['sent', 'approved']);
    expect(draftLogFetchUrls(50)).toEqual([
      '/api/agent/drafts?status=sent&limit=50',
      '/api/agent/drafts?status=approved&limit=50',
    ]);
    expect(draftLogFetchUrls()).not.toEqual(
      expect.arrayContaining([expect.stringContaining('status=pending')]),
    );
  });

  it('maps sent → Sent and every other status → Failed', () => {
    expect(draftLogOutcome('sent')).toBe('sent');
    expect(draftLogLabel('sent')).toBe('Sent');
    expect(draftLogOutcome('approved')).toBe('failed');
    expect(draftLogLabel('approved')).toBe('Failed');
    expect(draftLogOutcome('pending')).toBe('failed');
    expect(draftLogLabel('dismissed')).toBe('Failed');
  });

  it('keeps only sent and delivery-miss rows in the merged log', () => {
    const merged = mergeDraftLog([
      [
        draft({ id: 'pending-1', status: 'pending' }),
        draft({ id: 'sent-1', status: 'sent', createdAt: '2026-08-21T12:00:00.000Z' }),
      ],
      [
        draft({ id: 'miss-1', status: 'approved', createdAt: '2026-08-21T13:00:00.000Z' }),
        draft({ id: 'dismissed-1', status: 'dismissed' }),
      ],
    ]);
    expect(merged.map((row) => row.id)).toEqual(['miss-1', 'sent-1']);
    expect(merged.every(isDraftLogRow)).toBe(true);
  });

  it('does not speak like a review queue', () => {
    const spoken = [
      DRAFTS_PAGE_COPY.title,
      DRAFTS_PAGE_COPY.subtitle,
      DRAFTS_INBOX_COPY.sectionTitle,
      DRAFTS_INBOX_COPY.emptyHeadline,
      DRAFTS_INBOX_COPY.emptyNext,
    ].join(' ');
    expect(spoken).not.toMatch(/Approve/i);
    expect(spoken).not.toMatch(/waiting on you/i);
    expect(spoken).not.toMatch(/sign-off/i);
    expect(spoken).not.toMatch(/review/i);
    expect(DRAFTS_PAGE_COPY.subtitle).toMatch(/Chippi/);
    expect(DRAFTS_PAGE_COPY.subtitle).not.toMatch(/Chippy/);
  });
});

describe('drafts inbox + page source — no send gate', () => {
  it.each([
    ['inbox', INBOX_SRC],
    ['page', PAGE_SRC],
  ])('%s has no approve control, pending fetch, or waiting-on-you empty state', (_label, src) => {
    expect(src).not.toMatch(/Approve/);
    expect(src).not.toMatch(/Approve all/);
    expect(src).not.toMatch(/waiting on you/i);
    expect(src).not.toMatch(/sign-off/);
    expect(src).not.toMatch(/status=pending/);
    expect(src).not.toMatch(/method:\s*['"]PATCH['"]/);
  });

  it('page is the log, not a review station', () => {
    expect(PAGE_SRC).toMatch(/sent\/failed log/);
    expect(PAGE_SRC).toMatch(/AgentDraftInbox/);
    expect(PAGE_SRC).not.toMatch(/Chippy/);
  });
});
