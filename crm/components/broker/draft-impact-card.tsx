import type { DraftStats } from '@/lib/draft-stats';

/**
 * "Drafts sent" — single card on the broker dashboard. Reports how Chippi's
 * outreach landed across the brokerage over the trailing 30 days.
 *
 * This is a sent/failed log, not a review queue. The realtor does not
 * gate these sends.
 *
 * Three lines, in this order:
 *   1. Headline: sent count.
 *   2. Failed count when anything missed.
 *   3. Outcome rate, or "Not enough data yet" until the cron has labelled
 *      some sent drafts. Caveat omitted in the no-outcome state.
 *
 * Empty state (total === 0): one sentence, no numbers, no skeleton.
 *
 * The math lives in `lib/draft-stats.ts`; this file only renders.
 */

export const DRAFT_IMPACT_COPY = {
  title: 'Drafts sent',
  empty: 'No drafts sent in the last 30 days.',
  noOutcome: 'Not enough data yet.',
  caveat:
    "Correlation only — the deal moved after the draft sent. Chippi didn't necessarily cause it.",
} as const;

export interface DraftImpactSummary {
  sent: number;
  failed: number;
  empty: boolean;
  sentLine: string;
  failedLine: string | null;
}

export function draftImpactSummary(stats: DraftStats): DraftImpactSummary {
  const sent = stats.approved + stats.editedAndApproved;
  const failed = stats.rejected + stats.held;
  return {
    sent,
    failed,
    empty: stats.total === 0,
    sentLine: `${sent} sent`,
    failedLine: failed > 0 ? `${failed} failed` : null,
  };
}

export function DraftImpactCard({ stats }: { stats: DraftStats }) {
  return (
    <section className="rounded-xl border border-border/70 bg-card px-5 py-4 space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {DRAFT_IMPACT_COPY.title}
      </p>
      <DraftImpactBody stats={stats} />
    </section>
  );
}

function DraftImpactBody({ stats }: { stats: DraftStats }) {
  const summary = draftImpactSummary(stats);

  if (summary.empty) {
    return (
      <p className="text-sm text-muted-foreground">{DRAFT_IMPACT_COPY.empty}</p>
    );
  }

  const outcomePct = Math.round(stats.outcomeAdvancedRate * 100);
  const hasOutcome = stats.outcomeCheckedCount > 0;

  return (
    <>
      <p
        className="text-3xl tracking-tight tabular-nums text-foreground"
        style={{ fontFamily: 'var(--font-title)' }}
      >
        {summary.sent}
      </p>
      <p className="text-sm text-muted-foreground tabular-nums">
        {summary.sentLine}
        {summary.failedLine ? `. ${summary.failedLine}.` : '.'}
      </p>
      <p className="text-sm text-foreground">
        {hasOutcome ? (
          <>
            <span className="tabular-nums">{outcomePct}%</span> of sent drafts moved their
            deal within 7 days.
          </>
        ) : (
          <span className="text-muted-foreground">{DRAFT_IMPACT_COPY.noOutcome}</span>
        )}
      </p>
      {hasOutcome && (
        <p className="text-xs text-muted-foreground">
          {DRAFT_IMPACT_COPY.caveat}
        </p>
      )}
    </>
  );
}
