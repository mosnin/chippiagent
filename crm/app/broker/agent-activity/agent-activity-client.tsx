'use client';

import { useState, useTransition, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarCheck, ArrowUpRight, FilePen, Flag, ArrowRightLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';
import { DURATION_BASE, DURATION_FAST, EASE_OUT } from '@/lib/motion';
import { formatRelative } from '../reviews/reviews-client';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RealtorRollup {
  userId: string;
  name: string | null;
  email: string | null;
  spaceId: string;
  spaceSlug: string | null;
  totals: {
    all: number;
    completed: number;
    queued: number;
    failed: number;
    tours: number;
    stageMoves: number;
    reviews: number;
    drafts: number;
    routedOut: number;
    routedIn: number;
    runs: number;
  };
  lastActivityAt: string | null;
}

export interface ResponseShape {
  windowDays: number;
  generatedAt: string;
  realtors: RealtorRollup[];
  brokerage: { totals: RealtorRollup['totals']; realtorCount: number };
}

interface Props {
  initial: ResponseShape;
  brokerageName: string;
}

type Window = 7 | 30 | 90;

const WINDOWS: Array<{ days: Window; label: string }> = [
  { days: 7,  label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function initialOf(name: string | null, email: string | null): string {
  const src = (name && name.trim()) || email || '?';
  return src.charAt(0).toUpperCase();
}

function periodCopy(days: number): string {
  if (days === 7) return 'this week';
  if (days === 30) return 'this month';
  return `over ${days} days`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AgentActivityClient({ initial, brokerageName }: Props) {
  void brokerageName;

  const [data, setData] = useState<ResponseShape>(initial);
  const [windowDays, setWindowDays] = useState<Window>(initial.windowDays as Window);
  const [pending, startTransition] = useTransition();
  // Cache fetched windows so flipping between 7/30/90 doesn't refetch each time.
  const [cache, setCache] = useState<Partial<Record<Window, ResponseShape>>>({
    [initial.windowDays as Window]: initial,
  });

  function selectWindow(next: Window) {
    if (next === windowDays) return;
    setWindowDays(next);

    const cached = cache[next];
    if (cached) {
      setData(cached);
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/broker/agent-activity?days=${next}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        const json = (await res.json()) as ResponseShape;
        setData(json);
        setCache((c) => ({ ...c, [next]: json }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load activity';
        toast.error(msg);
      }
    });
  }

  const headlineNumber = data.brokerage.totals.all;
  const realtorCount = data.brokerage.realtorCount;

  // Top buckets for the snapshot grid — drafts get dropped here because
  // they're already conceptually paired with reviews + stage moves on the
  // realtor's side. Routes collapse into one bucket so we don't overweight
  // brokerage-only signal in the headline strip.
  const headlineCells = useMemo(() => {
    const t = data.brokerage.totals;
    return [
      { label: 'Drafts', value: t.drafts, icon: FilePen },
      { label: 'Tours', value: t.tours, icon: CalendarCheck },
      { label: 'Stage moves', value: t.stageMoves, icon: ArrowUpRight },
      { label: 'Routes', value: t.routedIn + t.routedOut, icon: ArrowRightLeft },
      { label: 'Reviews', value: t.reviews, icon: Flag },
    ];
  }, [data]);

  return (
    <div className="space-y-8">
      {/* Window selector — segmented control, sliding pill behind the active option */}
      <div className="flex items-center justify-between gap-3">
        <p className={cn('text-[11px] font-semibold tracking-[0.08em] uppercase text-muted-foreground')}>
          Window
        </p>
        <div role="radiogroup" aria-label="Time window" className="relative inline-flex items-center rounded-full border border-border/70 bg-card p-0.5">
          {WINDOWS.map((w) => {
            const isActive = w.days === windowDays;
            return (
              <button
                key={w.days}
                role="radio"
                aria-checked={isActive}
                onClick={() => selectWindow(w.days)}
                className={cn(
                  'relative z-10 px-3.5 py-1 text-xs font-medium tabular-nums transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {w.label}
                {isActive && (
                  <motion.span
                    layoutId="agent-activity-window-pill"
                    className="absolute inset-0 -z-10 rounded-full bg-muted"
                    transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Headline — the one number that matters, plus the bucket strip */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.section
          key={`hero-${windowDays}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0, transition: { duration: DURATION_BASE, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: DURATION_FAST } }}
          className="space-y-4"
        >
          <div>
            <p
              className="text-[44px] leading-none tracking-tight text-foreground tabular-nums"
              style={{ fontFamily: 'var(--font-title)' }}
            >
              {headlineNumber.toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {headlineNumber === 0
                ? <>Nothing yet {periodCopy(windowDays)}. Chippi takes a few days to warm up on a new team.</>
                : <>actions {periodCopy(windowDays)} across {realtorCount} {realtorCount === 1 ? 'realtor' : 'realtors'}.</>
              }
            </p>
          </div>

          {headlineNumber > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-px rounded-xl overflow-hidden border border-border/60 bg-border/60">
              {headlineCells.map(({ label, value, icon: Icon }) => (
                <div key={label} className="bg-background px-4 py-3.5">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <Icon size={11} />
                    <span>{label}</span>
                  </div>
                  <p className="text-2xl font-semibold tabular-nums mt-1 text-foreground">
                    {value.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </motion.section>
      </AnimatePresence>

      {/* Per-realtor list */}
      <section className="space-y-3">
        <div className="flex items-center gap-3 pb-3 border-b border-border/60">
          <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
            By realtor
          </h2>
          {realtorCount > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums">{realtorCount}</span>
          )}
          {pending && (
            <Loader2 size={11} className="animate-spin text-muted-foreground ml-1" />
          )}
        </div>

        {data.realtors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
            <p className="text-sm text-foreground">No team members yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Invite a realtor and Chippi&apos;s work will start landing here.
            </p>
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <StaggerList key={`list-${windowDays}`} className="divide-y divide-border/60">
              {data.realtors.map((r) => (
                <StaggerItem key={r.spaceId}>
                  <RealtorRow row={r} maxAll={data.realtors[0]?.totals.all ?? 0} />
                </StaggerItem>
              ))}
            </StaggerList>
          </AnimatePresence>
        )}
      </section>
    </div>
  );
}

// ── Realtor row ──────────────────────────────────────────────────────────────

function RealtorRow({ row, maxAll }: { row: RealtorRollup; maxAll: number }) {
  const name = row.name ?? row.email ?? 'Unnamed';
  const t = row.totals;
  // Visual weight: a thin horizontal bar inside the row whose length is
  // proportional to total activity vs. the busiest realtor in the window.
  // No numbers attached — the bar is a glance, the cells are the data.
  const proportion = maxAll > 0 ? Math.min(1, t.all / maxAll) : 0;

  // Inline cell list. Empty buckets are dropped so the eye doesn't count
  // zeros. Each cell is "noun count" — the count is the figure of merit.
  const cells: Array<[string, number]> = [
    ['drafts', t.drafts],
    ['tours', t.tours],
    ['stage moves', t.stageMoves],
    ['routes', t.routedIn + t.routedOut],
    ['reviews', t.reviews],
    ['runs', t.runs],
  ];
  const visibleCells = cells.filter(([, n]) => n > 0);

  return (
    <div className="group/row flex items-start gap-3 py-3">
      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-sm font-semibold text-muted-foreground">
        {initialOf(row.name, row.email)}
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium text-foreground truncate">{name}</p>
          <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
            {t.all.toLocaleString()} {t.all === 1 ? 'action' : 'actions'}
            {row.lastActivityAt && (
              <span className="text-muted-foreground/70"> · {formatRelative(row.lastActivityAt)}</span>
            )}
          </span>
        </div>

        {/* Activity bar — proportional to the busiest realtor */}
        <div className="h-1 bg-muted/60 rounded-full overflow-hidden" aria-hidden>
          <motion.div
            className="h-full bg-orange-500/80 dark:bg-orange-400/70 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${proportion * 100}%` }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          />
        </div>

        {/* Bucket cells — only the non-zero ones */}
        {visibleCells.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
            {visibleCells.map(([noun, n]) => (
              <span key={noun}>
                {n} {noun}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">quiet — no activity yet</p>
        )}
      </div>
    </div>
  );
}
