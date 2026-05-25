'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { MessageCircle } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export type ReviewStatus = 'open' | 'approved' | 'closed';

export interface ReviewRow {
  id: string;
  dealId: string;
  status: ReviewStatus;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedNote: string | null;
  deal: {
    id: string;
    title: string | null;
    value: number | null;
  };
  commentCount: number;
}

type Tab = 'open' | 'resolved' | 'all';

interface Props {
  slug: string;
  initialReviews: ReviewRow[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Relative time using Intl.RelativeTimeFormat. Copied verbatim from
// app/broker/reviews/reviews-client.tsx (formatRelative) to keep styling
// consistent — over-abstracting a 30-line helper would cost more than
// duplicating it once.
export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = then - now;
  const diffSec = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSec);
  const sevenDays = 7 * 24 * 60 * 60;

  if (abs > sevenDays) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const buckets: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1],
  ];
  for (const [unit, secs] of buckets) {
    if (abs >= secs || unit === 'second') {
      return rtf.format(Math.round(diffSec / secs), unit);
    }
  }
  return rtf.format(diffSec, 'second');
}

const statusBadgeClass = (status: ReviewStatus): string => {
  switch (status) {
    case 'open':
      return 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15';
    case 'approved':
      return 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15';
    case 'closed':
    default:
      return 'text-muted-foreground bg-muted';
  }
};

const statusLabel = (status: ReviewStatus): string =>
  status === 'open' ? 'Open' : status === 'approved' ? 'Approved' : 'Closed';

// ── Component ────────────────────────────────────────────────────────────────

export function ReviewsClient({ slug, initialReviews }: Props) {
  const [tab, setTab] = useState<Tab>('open');

  const filtered = useMemo(() => {
    if (tab === 'all') return initialReviews;
    if (tab === 'open') return initialReviews.filter((r) => r.status === 'open');
    // resolved = approved OR closed
    return initialReviews.filter((r) => r.status === 'approved' || r.status === 'closed');
  }, [tab, initialReviews]);

  const tabs: Array<{ key: Tab; label: string }> = useMemo(
    () => [
      { key: 'open', label: 'Open' },
      { key: 'resolved', label: 'Resolved' },
      { key: 'all', label: 'All' },
    ],
    [],
  );

  const emptyCopy = (t: Tab): string => {
    if (t === 'open') {
      return 'No reviews in flight. Flag a deal for broker review from the deal page when you want a second set of eyes.';
    }
    if (t === 'resolved') {
      return 'Nothing resolved yet.';
    }
    return "You haven't flagged anything yet.";
  };

  return (
    <div className="space-y-4">
      {/* Tabs — visual pattern mirrors app/broker/reviews/reviews-client.tsx */}
      <div className="flex items-center gap-1 border-b border-border pb-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative px-3 py-2 text-sm font-medium transition-colors rounded-t-md ${
              tab === t.key ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {tab === t.key && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">{emptyCopy(tab)}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const dealTitle = r.deal.title ?? 'Untitled deal';
            const preview =
              r.reason.length > 140 ? `${r.reason.slice(0, 137).trimEnd()}…` : r.reason;

            return (
              <Link
                key={r.id}
                href={`/s/${slug}/reviews/${r.id}`}
                className="block rounded-xl border border-border bg-card px-4 py-3 hover:bg-accent/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-semibold text-primary truncate">
                        {dealTitle}
                      </span>
                      <span className="text-muted-foreground text-xs">·</span>
                      <span className="text-xs text-muted-foreground">
                        flagged {formatRelative(r.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {preview}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {r.commentCount > 0 && (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 bg-muted text-muted-foreground"
                        aria-label={`${r.commentCount} comment${r.commentCount === 1 ? '' : 's'}`}
                      >
                        <MessageCircle size={11} />
                        {r.commentCount}
                      </span>
                    )}
                    <span
                      className={`inline-flex text-xs font-medium rounded-full px-2.5 py-0.5 ${statusBadgeClass(r.status)}`}
                    >
                      {statusLabel(r.status)}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
