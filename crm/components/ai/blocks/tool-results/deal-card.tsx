'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Briefcase, ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo, formatCurrency } from '@/lib/formatting';
import { DURATION_BASE, EASE_IN_OUT } from '@/lib/motion';
import { useCardDetail } from '@/hooks/use-card-detail';
import { CardSkeleton } from '../card-skeleton';

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface DealSummary {
  id: string;
  title: string;
  address?: string | null;
  value?: number | null;
  status?: string;
  priority?: string;
  stageId?: string;
  closeDate?: string | null;
  nextAction?: string | null;
  nextActionDueAt?: string | null;
}

interface DealDetail {
  id: string;
  title: string;
  stage: string;
  amount: number | null;
  commissionEstimate: number | null;
  property: { id: string; address: string } | null;
  contacts: Array<{ id: string; name: string }>;
  notes: Array<{ id: string; content: string; createdAt: string }>;
  nextStep: string | null;
  closeDate: string | null;
  priority: string | null;
}

interface DealCardProps {
  deal: DealSummary;
  slug: string;
  animDelay?: number;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function formatValue(v: number | null | undefined): string | null {
  if (v == null) return null;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${Math.round(v)}`;
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ─── Stage chip ─────────────────────────────────────────────────────────── */

const STAGE_CHIP: Record<string, string> = {
  active:       'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/15',
  offer:        'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/15',
  under_contract: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/15',
  won:          'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15',
  closed:       'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15',
  lost:         'text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/15',
};

function stageChipClass(stage: string | undefined): string {
  if (!stage) return 'text-muted-foreground bg-muted';
  const key = stage.toLowerCase().replace(/\s+/g, '_');
  return STAGE_CHIP[key] ?? 'text-muted-foreground bg-muted';
}

/* ─── Avatar initials ────────────────────────────────────────────────────── */

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  const letters =
    parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  return (
    <span
      aria-label={name}
      className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
    >
      {letters}
    </span>
  );
}

/* ─── Collapsed row ──────────────────────────────────────────────────────── */

function CollapsedRow({ deal, isExpanded }: { deal: DealSummary; isExpanded: boolean }) {
  const value = formatValue(deal.value);
  const overdue =
    deal.nextActionDueAt && new Date(deal.nextActionDueAt) < new Date()
      ? deal.nextActionDueAt
      : null;
  const stageName = deal.stageId ?? deal.status ?? '';

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {/* Icon */}
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted/60">
        <Briefcase size={16} className="text-muted-foreground" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Title row */}
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{deal.title}</span>
          {value && (
            <span className="flex-shrink-0 text-sm font-semibold text-foreground tabular-nums">
              {value}
            </span>
          )}
          {stageName && (
            <span
              className={cn(
                'flex-shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                stageChipClass(stageName),
              )}
            >
              {stageName.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        {/* Sub-row */}
        <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
          {deal.address && (
            <span className="truncate">{deal.address}</span>
          )}
          {deal.nextAction && (
            <span
              className={cn(
                'truncate',
                overdue && 'text-rose-600 dark:text-rose-400',
              )}
            >
              {overdue ? 'overdue: ' : 'next: '}
              {deal.nextAction}
            </span>
          )}
        </div>
      </div>

      {/* Chevron */}
      <ChevronRight
        size={13}
        className={cn(
          'flex-shrink-0 text-muted-foreground/60 transition-transform duration-150',
          isExpanded && 'rotate-90',
        )}
      />
    </div>
  );
}

/* ─── Expanded detail ────────────────────────────────────────────────────── */

function ExpandedDetail({ detail, slug }: { detail: DealDetail; slug: string }) {
  const dealHref = slug ? `/s/${slug}/deals` : '#';

  return (
    <div className="space-y-4">
      {/* Actions */}
      <a
        href={dealHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-muted-foreground transition-colors"
      >
        View Deal
        <ExternalLink size={12} />
      </a>

      {/* Data grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-[11px]">
        <div className="flex gap-1.5">
          <span className="text-muted-foreground w-24 flex-shrink-0">Deal value</span>
          <span className="font-medium text-foreground tabular-nums">
            {detail.amount != null ? formatCurrency(detail.amount) : '—'}
          </span>
        </div>
        <div className="flex gap-1.5">
          <span className="text-muted-foreground w-24 flex-shrink-0">Commission</span>
          <span className="font-medium text-foreground tabular-nums">
            {detail.commissionEstimate != null
              ? `~${formatCurrency(detail.commissionEstimate)}`
              : '—'}
          </span>
        </div>
        <div className="flex gap-1.5">
          <span className="text-muted-foreground w-24 flex-shrink-0">Stage</span>
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
              stageChipClass(detail.stage),
            )}
          >
            {detail.stage?.replace(/_/g, ' ') ?? '—'}
          </span>
        </div>
        <div className="flex gap-1.5">
          <span className="text-muted-foreground w-24 flex-shrink-0">Close date</span>
          <span className="font-medium text-foreground">{formatShortDate(detail.closeDate)}</span>
        </div>
        <div className="flex gap-1.5">
          <span className="text-muted-foreground w-24 flex-shrink-0">Priority</span>
          <span className="font-medium text-foreground capitalize">{detail.priority ?? '—'}</span>
        </div>
        {detail.property && (
          <div className="flex gap-1.5">
            <span className="text-muted-foreground w-24 flex-shrink-0">Property</span>
            <span className="font-medium text-foreground truncate">{detail.property.address}</span>
          </div>
        )}
      </div>

      {/* Contacts */}
      {detail.contacts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Contacts on this deal
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {detail.contacts.map((c) => (
              <div key={c.id} className="flex items-center gap-1.5">
                <Initials name={c.name} />
                <span className="text-[11px] text-foreground">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next step */}
      {detail.nextStep && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Next step
          </p>
          <p className="text-[11px] text-foreground">{detail.nextStep}</p>
        </div>
      )}

      {/* Notes */}
      {detail.notes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Notes
          </p>
          <ul className="space-y-1.5">
            {detail.notes.map((n) => (
              <li key={n.id} className="text-[11px] text-muted-foreground">
                <span className="text-foreground">&ldquo;{n.content}&rdquo;</span>
                {' '}
                <span className="tabular-nums">— {timeAgo(n.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ─── DealCard ───────────────────────────────────────────────────────────── */

export function DealCard({ deal, slug, animDelay = 0 }: DealCardProps) {
  const [open, setOpen] = useState(false);
  const { data, loading, error, fetchDetail } = useCardDetail<DealDetail>('deal', deal.id, slug);

  const toggle = () => {
    if (!open) fetchDetail();
    setOpen((v) => !v);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_IN_OUT, delay: animDelay }}
      className={cn(
        'rounded-xl border border-border/60 bg-background overflow-hidden cursor-pointer',
        open && 'border-border',
      )}
    >
      {/* Collapsed row — always visible */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle()}
        className="hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <CollapsedRow deal={deal} isExpanded={open} />
      </div>

      {/* Expanded detail — framer-motion height animation */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DURATION_BASE, ease: EASE_IN_OUT }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/40 bg-muted/20 px-4 py-4">
              {loading && <CardSkeleton rows={4} />}
              {error && (
                <p className="text-[11px] text-muted-foreground">Could not load deal details.</p>
              )}
              {data && <ExpandedDetail detail={data} slug={slug} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
