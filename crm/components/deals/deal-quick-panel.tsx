'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Trophy, XCircle, ArrowUpRight, Activity, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatCompact, timeAgo } from '@/lib/formatting';
import { dealHealth, HEALTH_META, inferNextAction } from '@/lib/deals/health';
import {
  H2,
  TITLE_FONT,
  BODY,
  BODY_MUTED,
  SECTION_LABEL,
  PRIMARY_PILL,
  GHOST_PILL,
} from '@/lib/typography';
import { DealInlineField } from './deal-inline-field';
import type { Deal, DealStage, Contact, DealContact, DealActivity } from '@/lib/types';
import { toast } from 'sonner';

type DealWithRelations = Deal & {
  stage: DealStage;
  dealContacts: (DealContact & { contact: Pick<Contact, 'id' | 'name'> })[];
};

interface DealQuickPanelProps {
  deal: DealWithRelations | null;
  slug: string;
  stages: DealStage[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (deal: DealWithRelations, status: 'won' | 'lost' | 'on_hold' | 'active') => void;
  onStageChange: (dealId: string, stageId: string) => void;
}

/**
 * Right-side slide-over for a deal. The realtor stays on the kanban, opens
 * the deal, takes action, closes — without ever leaving the page. Inline
 * fields PATCH on blur. Status buttons trigger the parent's existing
 * won/lost dialog flow. Stage selector PATCHes through to the parent so the
 * board reflects the move.
 */
export function DealQuickPanel({
  deal,
  slug,
  stages,
  open,
  onOpenChange,
  onStatusChange,
  onStageChange,
}: DealQuickPanelProps) {
  const [activities, setActivities] = useState<DealActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [posting, setPosting] = useState(false);

  // Load activity timeline whenever the panel opens for a new deal.
  useEffect(() => {
    if (!open || !deal) return;
    let cancelled = false;
    setActivitiesLoading(true);
    setActivities([]);
    fetch(`/api/deals/${deal.id}/activity`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled) setActivities(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setActivities([]);
      })
      .finally(() => {
        if (!cancelled) setActivitiesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, deal]);

  if (!deal) return null;

  const isActive = deal.status === 'active';
  const health = dealHealth(deal);
  const healthMeta = HEALTH_META[health.state];
  const nextAction = inferNextAction(deal);
  const gci =
    deal.value != null && deal.commissionRate != null
      ? (deal.value * deal.commissionRate) / 100
      : null;

  async function postNote() {
    if (!noteDraft.trim() || !deal) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'note', content: noteDraft.trim() }),
      });
      if (!res.ok) {
        toast.error("Couldn't save that note.");
        return;
      }
      const created = await res.json();
      setActivities((prev) => [created, ...prev]);
      setNoteDraft('');
    } catch {
      toast.error("Couldn't save that note.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[480px] p-0 gap-0 flex flex-col"
      >
        {/* Hidden title for a11y; the visible H2 is below. */}
        <SheetHeader className="sr-only">
          <SheetTitle>{deal.title}</SheetTitle>
        </SheetHeader>

        {/* Header — title + meta */}
        <div className="px-6 pt-6 pb-4 border-b border-border/70">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2
                className={cn(H2, 'text-2xl truncate pr-8')}
                style={TITLE_FONT}
              >
                {deal.title}
              </h2>
              {deal.address && (
                <p className={cn(BODY_MUTED, 'mt-1 truncate')}>{deal.address}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <StagePill
              stages={stages}
              currentStageId={deal.stageId}
              onChange={(stageId) => onStageChange(deal.id, stageId)}
            />
            {isActive && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 h-6 text-[11px] font-medium',
                  'bg-foreground/[0.04] text-muted-foreground',
                )}
                title={health.reason || healthMeta.label}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', healthMeta.dotClass)} />
                {healthMeta.label}
              </span>
            )}
            {deal.status === 'won' && (
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 h-6 text-[11px] font-medium bg-foreground/[0.04] text-muted-foreground">
                <Trophy size={11} />
                Won
              </span>
            )}
            {deal.status === 'lost' && (
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 h-6 text-[11px] font-medium bg-foreground/[0.04] text-muted-foreground">
                <XCircle size={11} />
                Lost
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Focal value row */}
          <div className="px-6 py-5 border-b border-border/70">
            <div className="grid grid-cols-2 gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70">
              <div className="bg-background p-4">
                <p className={SECTION_LABEL}>Value</p>
                <p
                  className="text-2xl tracking-tight tabular-nums mt-1.5 text-foreground"
                  style={TITLE_FONT}
                >
                  {deal.value != null ? formatCurrency(deal.value) : '—'}
                </p>
                {gci != null && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    GCI {formatCompact(gci)}
                  </p>
                )}
              </div>
              <div className="bg-background p-4">
                <p className={SECTION_LABEL}>Close</p>
                <p
                  className="text-2xl tracking-tight tabular-nums mt-1.5 text-foreground"
                  style={TITLE_FONT}
                >
                  {deal.closeDate
                    ? new Date(deal.closeDate as unknown as string).toLocaleDateString(
                        undefined,
                        { month: 'short', day: 'numeric' },
                      )
                    : '—'}
                </p>
                {deal.closeDate && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {new Date(deal.closeDate as unknown as string).toLocaleDateString(
                      undefined,
                      { year: 'numeric' },
                    )}
                  </p>
                )}
              </div>
            </div>

            {nextAction && isActive && (
              <p className={cn(BODY, 'mt-4')}>
                <span className="text-muted-foreground">Next: </span>
                {nextAction.label}
              </p>
            )}
          </div>

          {/* Inline-editable fields */}
          <div className="px-6 py-5 border-b border-border/70 space-y-4">
            <FieldRow label="Title">
              <DealInlineField
                dealId={deal.id}
                field="title"
                value={deal.title}
                type="text"
                label="Title"
                placeholder="Deal title"
              />
            </FieldRow>
            <FieldRow label="Address">
              <DealInlineField
                dealId={deal.id}
                field="address"
                value={deal.address ?? null}
                type="text"
                label="Address"
                placeholder="Not set"
              />
            </FieldRow>
            <FieldRow label="Value">
              <DealInlineField
                dealId={deal.id}
                field="value"
                value={deal.value}
                type="number"
                label="Value"
                prefix="$"
                placeholder="Not set"
                displayValue={
                  deal.value != null ? `$${deal.value.toLocaleString()}` : ''
                }
                min={0}
                step={1000}
              />
            </FieldRow>
            <FieldRow label="Notes">
              <DealInlineField
                dealId={deal.id}
                field="description"
                value={deal.description ?? null}
                type="textarea"
                label="Notes"
                placeholder="Add notes…"
              />
            </FieldRow>
          </div>

          {/* Linked contacts */}
          {deal.dealContacts.length > 0 && (
            <div className="px-6 py-5 border-b border-border/70">
              <p className={cn(SECTION_LABEL, 'mb-3')}>People</p>
              <div className="space-y-2">
                {deal.dealContacts.map(({ contact }) => (
                  <Link
                    key={contact.id}
                    href={`/s/${slug}/contacts/${contact.id}`}
                    className="flex items-center justify-between gap-2 rounded-md px-3 py-2 -mx-3 hover:bg-foreground/[0.04] transition-colors"
                  >
                    <span className={BODY}>{contact.name}</span>
                    <ArrowUpRight
                      size={13}
                      className="text-muted-foreground/50"
                    />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Quick note + activity timeline */}
          <div className="px-6 py-5">
            <p className={cn(SECTION_LABEL, 'mb-3 flex items-center gap-1.5')}>
              <Activity size={11} />
              Activity
            </p>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') postNote();
              }}
              placeholder="Add a note…"
              rows={2}
              className="w-full rounded-md border border-border/70 bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            />
            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={postNote}
                disabled={!noteDraft.trim() || posting}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-xs font-medium',
                  'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
                  'transition-colors duration-150 disabled:opacity-40 disabled:hover:bg-transparent',
                )}
              >
                {posting ? 'Posting…' : 'Add note'}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {activitiesLoading ? (
                <p className="text-xs text-muted-foreground">One moment.</p>
              ) : activities.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nothing logged yet.
                </p>
              ) : (
                activities.slice(0, 8).map((a) => (
                  <div key={a.id} className="flex gap-3 text-sm">
                    <FileText
                      size={12}
                      className="text-muted-foreground/60 mt-1 flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      {a.content && (
                        <p className="text-foreground whitespace-pre-wrap break-words">
                          {a.content}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {timeAgo(new Date(a.createdAt as unknown as string))}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-border/70 flex items-center gap-2">
          <Link
            href={`/s/${slug}/deals/${deal.id}`}
            className={cn(GHOST_PILL, 'h-8 px-3 text-xs')}
          >
            Open full
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {deal.status !== 'lost' && deal.status !== 'won' && (
              <button
                type="button"
                onClick={() => onStatusChange(deal, 'lost')}
                className={cn(GHOST_PILL, 'h-8 px-3 text-xs')}
              >
                <XCircle size={12} strokeWidth={2} />
                Mark lost
              </button>
            )}
            {deal.status !== 'won' && (
              <button
                type="button"
                onClick={() => onStatusChange(deal, 'won')}
                className={cn(PRIMARY_PILL, 'h-8 px-3 text-xs')}
              >
                <Trophy size={12} strokeWidth={2.25} />
                Mark won
              </button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className={cn(SECTION_LABEL, 'mb-1')}>{label}</p>
      {children}
    </div>
  );
}

function StagePill({
  stages,
  currentStageId,
  onChange,
}: {
  stages: DealStage[];
  currentStageId: string;
  onChange: (stageId: string) => void;
}) {
  const current = stages.find((s) => s.id === currentStageId);
  return (
    <div className="relative">
      <select
        value={currentStageId}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-full px-2.5 h-6 text-[11px] font-medium bg-foreground/[0.04] text-foreground hover:bg-foreground/[0.06] transition-colors pr-7 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Stage"
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">
        {current ? '▾' : ''}
      </span>
    </div>
  );
}
