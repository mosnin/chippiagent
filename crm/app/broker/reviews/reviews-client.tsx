'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';
import { DURATION_BASE, DURATION_FAST, EASE_OUT } from '@/lib/motion';

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
  requestingUser: {
    id: string;
    name: string | null;
    email: string | null;
  };
  deal: {
    id: string;
    title: string | null;
    value: number | null;
    spaceSlug: string | null;
  };
  commentCount: number;
}

type Tab = 'open' | 'approved' | 'closed' | 'all';

interface Props {
  initialReviews: ReviewRow[];
  initialOpenCount: number;
  role: string;
  brokerageName: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function initialsOf(name: string | null, email: string | null): string {
  const src = (name && name.trim()) || email || '?';
  return src
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

// Relative time — short and present-tense for the queue. Past 7 days falls
// back to a date so the eye doesn't have to do "53 days ago" math.
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

export function ReviewsClient({ initialReviews, initialOpenCount, role, brokerageName }: Props) {
  // Surface-level bookkeeping — preserved for future header polish.
  void role;
  void brokerageName;

  const [tab, setTab] = useState<Tab>('open');
  const [reviews, setReviews] = useState<ReviewRow[]>(initialReviews);
  const [loading, setLoading] = useState(false);
  // Cache of fetched-tabs so switching back doesn't refetch every click.
  const [cache, setCache] = useState<Partial<Record<Tab, ReviewRow[]>>>({
    open: initialReviews,
  });
  // Live open count so the tab badge updates after a resolve happens
  // somewhere in this brokerage. Best-effort: derived from the cached
  // open list when present, otherwise the SSR count.
  const openCount = useMemo(() => {
    const cached = cache.open;
    if (cached) return cached.length;
    return initialOpenCount;
  }, [cache.open, initialOpenCount]);

  useEffect(() => {
    const cached = cache[tab];
    if (cached) {
      setReviews(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/broker/reviews?status=${tab}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`Failed to load reviews (${res.status})`);
        const data = (await res.json()) as ReviewRow[];
        if (cancelled) return;
        setReviews(data);
        setCache((c) => ({ ...c, [tab]: data }));
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load reviews';
        toast.error(msg);
        setReviews([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, cache]);

  const tabs: Array<{ key: Tab; label: string; count?: number }> = useMemo(
    () => [
      { key: 'open', label: 'Open', count: openCount },
      { key: 'approved', label: 'Approved' },
      { key: 'closed', label: 'Closed' },
      { key: 'all', label: 'All' },
    ],
    [openCount],
  );

  return (
    <div className="space-y-5">
      {/* Tabs — sliding indicator under the active label, the way iOS does it. */}
      <div role="tablist" aria-label="Review status" className="flex items-center gap-0 border-b border-border/60">
        {tabs.map((t) => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(t.key)}
              className={cn(
                'relative inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span>{t.label}</span>
              {typeof t.count === 'number' && t.count > 0 && (
                <span
                  className={cn(
                    'inline-flex items-center justify-center min-w-[1.25rem] h-[1.125rem] rounded-full px-1.5 text-[10px] font-semibold tabular-nums transition-colors',
                    isActive
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground',
                  )}
                  aria-hidden
                >
                  {t.count}
                </span>
              )}
              {isActive && (
                <motion.span
                  layoutId="reviews-tab-underline"
                  className="absolute bottom-[-1px] left-2 right-2 h-[2px] rounded-full bg-foreground"
                  transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Body — list animates in; tab swap fades through */}
      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: DURATION_FAST } }}
            exit={{ opacity: 0, transition: { duration: DURATION_FAST } }}
            className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground"
          >
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </motion.div>
        ) : reviews.length === 0 ? (
          <motion.div
            key={`empty-${tab}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, transition: { duration: DURATION_BASE, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: DURATION_FAST } }}
            className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center"
          >
            <p className="text-sm text-foreground">
              {tab === 'open' ? "You're all caught up." : `No ${tab} reviews.`}
            </p>
            {tab === 'open' && (
              <p className="text-xs text-muted-foreground mt-1">
                When an agent flags a deal for you, it lands here.
              </p>
            )}
          </motion.div>
        ) : (
          <StaggerList key={`list-${tab}`} className="space-y-2">
            {reviews.map((r) => {
              const agentInitials = initialsOf(r.requestingUser.name, r.requestingUser.email);
              const agentName = r.requestingUser.name ?? r.requestingUser.email ?? 'Unknown agent';
              const dealTitle = r.deal.title ?? 'Untitled deal';
              const preview =
                r.reason.length > 140 ? `${r.reason.slice(0, 137).trimEnd()}…` : r.reason;

              return (
                <StaggerItem key={r.id}>
                  <Link
                    href={`/broker/reviews/${r.id}`}
                    className="group/row block rounded-xl border border-border/70 bg-card px-4 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-orange-500/10 dark:bg-orange-500/15 flex items-center justify-center text-xs font-semibold text-orange-600 dark:text-orange-400 flex-shrink-0">
                          {agentInitials}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <p className="text-sm font-semibold truncate">{agentName}</p>
                            <span className="text-muted-foreground text-xs">·</span>
                            <span className="text-sm text-foreground truncate">
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
                          className={cn(
                            'inline-flex text-xs font-medium rounded-full px-2.5 py-0.5',
                            statusBadgeClass(r.status),
                          )}
                        >
                          {statusLabel(r.status)}
                        </span>
                      </div>
                    </div>
                  </Link>
                </StaggerItem>
              );
            })}
          </StaggerList>
        )}
      </AnimatePresence>
    </div>
  );
}
