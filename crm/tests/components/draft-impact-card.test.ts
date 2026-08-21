/**
 * Broker "Drafts sent" card. Pins sent/failed language so this surface
 * cannot be read as an approval queue.
 *
 * No render — the project doesn't ship jsdom.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  DraftImpactCard,
  DRAFT_IMPACT_COPY,
  draftImpactSummary,
} from '@/components/broker/draft-impact-card';
import type { DraftStats } from '@/lib/draft-stats';

const CARD_SRC = readFileSync(
  resolve(process.cwd(), 'components/broker/draft-impact-card.tsx'),
  'utf8',
);

function stats(partial: Partial<DraftStats> = {}): DraftStats {
  return {
    windowDays: 30,
    total: 0,
    approved: 0,
    editedAndApproved: 0,
    rejected: 0,
    held: 0,
    approvalRate: 0,
    editedRate: 0,
    medianEditDistance: null,
    medianDecisionMs: null,
    outcomeCheckedCount: 0,
    outcomeAdvancedRate: 0,
    ...partial,
  };
}

describe('DraftImpactCard — sent/failed, not approval', () => {
  it('exports the card component', () => {
    expect(typeof DraftImpactCard).toBe('function');
  });

  it('empty state does not wait on a human', () => {
    expect(draftImpactSummary(stats()).empty).toBe(true);
    expect(DRAFT_IMPACT_COPY.empty).toBe('No drafts sent in the last 30 days.');
    expect(DRAFT_IMPACT_COPY.empty).not.toMatch(/waiting on you/i);
    expect(DRAFT_IMPACT_COPY.empty).not.toMatch(/Approve/i);
  });

  it('counts sent vs failed without an approval headline', () => {
    const summary = draftImpactSummary(
      stats({
        total: 10,
        approved: 6,
        editedAndApproved: 2,
        rejected: 1,
        held: 1,
      }),
    );
    expect(summary.empty).toBe(false);
    expect(summary.sent).toBe(8);
    expect(summary.failed).toBe(2);
    expect(summary.sentLine).toBe('8 sent');
    expect(summary.failedLine).toBe('2 failed');
  });

  it('omits the failed line when everything sent', () => {
    const summary = draftImpactSummary(
      stats({ total: 3, approved: 3, editedAndApproved: 0, rejected: 0, held: 0 }),
    );
    expect(summary.failedLine).toBeNull();
    expect(summary.sentLine).toBe('3 sent');
  });

  it('user-facing copy never asks anyone to approve', () => {
    const spoken = Object.values(DRAFT_IMPACT_COPY).join(' ');
    expect(spoken).not.toMatch(/Approve/i);
    expect(spoken).not.toMatch(/approval/i);
    expect(spoken).not.toMatch(/waiting on you/i);
    expect(spoken).toMatch(/Chippi/);
    expect(spoken).not.toMatch(/Chippy/);
    expect(DRAFT_IMPACT_COPY.title).toBe('Drafts sent');
  });

  it('source is a sent/failed log, not a review-queue card', () => {
    expect(CARD_SRC).toMatch(/sent\/failed log/);
    expect(CARD_SRC).not.toMatch(/Approve &/);
    expect(CARD_SRC).not.toMatch(/Approve all/);
    expect(CARD_SRC).not.toMatch(/waiting on you/i);
    expect(CARD_SRC).not.toMatch(/Chippy/);
  });
});
