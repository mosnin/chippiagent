'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useRouter } from 'next/navigation';
import {
  GripVertical,
  Trash2,
  Trophy,
  XCircle,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import type { Deal, DealStage, Contact, DealContact } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatCompact, formatCurrency } from '@/lib/formatting';
import { dealHealth, inferNextAction, HEALTH_META } from '@/lib/deals/health';
import { summarizeChecklist, type DealChecklistItem } from '@/lib/deals/checklist';
import { TITLE_FONT } from '@/lib/typography';

type DealWithRelations = Deal & {
  stage: DealStage;
  dealContacts: (DealContact & { contact: Pick<Contact, 'id' | 'name'> })[];
  /** Optional — stages endpoint attaches a minimal projection for the card chip. */
  checklist?: Pick<DealChecklistItem, 'completedAt' | 'dueAt' | 'label'>[];
};

interface DealCardProps {
  deal: DealWithRelations;
  slug: string;
  onDelete: (id: string) => void;
  onStatusChange?: (
    deal: DealWithRelations,
    status: 'won' | 'lost' | 'on_hold' | 'active',
  ) => void;
  /** Next stage in this pipeline — drives the "Advance stage" button. Null when this is the last stage. */
  nextStage?: DealStage | null;
  /** Called when the realtor clicks the "Advance" button. */
  onAdvanceStage?: (deal: DealWithRelations, nextStageId: string) => void;
  /** Open the deal in the slide-over panel. If omitted, falls back to navigation. */
  onOpenDeal?: (deal: DealWithRelations) => void;
}

/**
 * Kanban tile. Paper-flat — the focal note is the financial value (serif).
 * No bright color pills. Status / health is communicated via a single dot
 * and one line of muted text. The card lives by what it doesn't show.
 */
export function DealCard({
  deal,
  slug,
  onDelete,
  onStatusChange,
  nextStage,
  onAdvanceStage,
  onOpenDeal,
}: DealCardProps) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const health = dealHealth(deal);
  const healthMeta = HEALTH_META[health.state];
  const nextAction = inferNextAction(deal);
  const isActive = deal.status === 'active';
  const checklistSummary = summarizeChecklist(deal.checklist ?? []);
  const canAdvance = isActive && nextStage && onAdvanceStage;

  function handleOpen() {
    if (onOpenDeal) onOpenDeal(deal);
    else router.push(`/s/${slug}/deals/${deal.id}`);
  }

  return (
    <div ref={setNodeRef} style={style} className="mb-2">
      <div
        className={cn(
          'group bg-background border border-border/70 rounded-md p-3 cursor-pointer',
          'transition-colors duration-150',
          'hover:bg-foreground/[0.04]',
          // Closed deals recede — still scannable, visually quieter.
          deal.status === 'won' && 'opacity-75',
          deal.status === 'lost' && 'opacity-55',
          deal.status === 'on_hold' && 'opacity-70',
        )}
        onClick={handleOpen}
      >
        <div className="flex items-start gap-2">
          {/* Drag handle — stops propagation so clicking doesn't open the panel */}
          <button
            {...attributes}
            {...listeners}
            className="mt-0.5 text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0 transition-colors"
            onClick={(e) => e.stopPropagation()}
            aria-label="Reorder deal"
          >
            <GripVertical size={14} />
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Title row with health dot */}
            <div className="flex items-center gap-1.5">
              {isActive && (
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0',
                    healthMeta.dotClass,
                  )}
                  title={
                    health.reason
                      ? `${healthMeta.label} — ${health.reason}`
                      : healthMeta.label
                  }
                  aria-label={`Health: ${healthMeta.label}${
                    health.reason ? `, ${health.reason}` : ''
                  }`}
                />
              )}
              <p
                className={cn(
                  'text-sm font-medium leading-tight truncate text-foreground',
                  deal.status === 'lost' && 'line-through text-muted-foreground',
                )}
              >
                {deal.title}
              </p>
            </div>

            {deal.address && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {deal.address}
              </p>
            )}

            {/* Focal value — serif Times, the loudest note on the card. */}
            {deal.value != null && (
              <p
                className="text-base tabular-nums text-foreground mt-1.5 leading-none"
                style={TITLE_FONT}
              >
                {formatCurrency(deal.value)}
              </p>
            )}

            {/* GCI — quiet meta */}
            {deal.value != null && deal.commissionRate != null && (
              <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                GCI {formatCompact((deal.value * deal.commissionRate) / 100)}
              </p>
            )}

            {/* Next-action line — the most actionable text on the card */}
            {nextAction && isActive && (
              <p
                className={cn(
                  'text-xs mt-2 truncate',
                  health.state === 'stuck' || health.state === 'at-risk'
                    ? 'text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {nextAction.label}
              </p>
            )}

            {/* Closing-checklist chip — progress + soonest deadline */}
            {checklistSummary &&
              (() => {
                const due = checklistSummary.nextDueAt;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                let dueLabel: string | null = null;
                if (due) {
                  const days = Math.round(
                    (due.getTime() - today.getTime()) / 86_400_000,
                  );
                  if (days < 0) dueLabel = `${Math.abs(days)}d overdue`;
                  else if (days === 0) dueLabel = 'today';
                  else if (days <= 14) dueLabel = `in ${days}d`;
                  else
                    dueLabel = due.toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    });
                }
                return (
                  <div
                    className={cn(
                      'flex items-center gap-1.5 mt-2 text-[11px]',
                      checklistSummary.anyOverdue
                        ? 'text-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    <CheckCircle2 size={11} />
                    <span className="tabular-nums">
                      {checklistSummary.complete}/{checklistSummary.total}
                    </span>
                    {checklistSummary.nextLabel && (
                      <span className="truncate">
                        · {checklistSummary.nextLabel}
                        {dueLabel ? ` · ${dueLabel}` : ''}
                      </span>
                    )}
                  </div>
                );
              })()}

            {/* Linked contacts — quiet text, no chips */}
            {deal.dealContacts.length > 0 && (
              <p className="text-[11px] text-muted-foreground truncate mt-2">
                {deal.dealContacts
                  .slice(0, 2)
                  .map(({ contact }) => contact.name)
                  .join(', ')}
                {deal.dealContacts.length > 2 &&
                  ` +${deal.dealContacts.length - 2}`}
              </p>
            )}

            {/* Advance-stage button — one-tap primary action on each card. */}
            {canAdvance && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAdvanceStage(deal, nextStage.id);
                }}
                className={cn(
                  'mt-2.5 w-full inline-flex items-center justify-center gap-1.5',
                  'rounded-md text-[11px] font-medium py-1.5 px-2',
                  'border border-border/70 bg-background',
                  'hover:bg-foreground hover:text-background hover:border-foreground',
                  'transition-colors duration-150',
                )}
                title={`Move to ${nextStage.name}`}
              >
                <ArrowRight size={11} />
                <span className="truncate">Advance to {nextStage.name}</span>
              </button>
            )}
          </div>

          {/* Hover quick-actions — won / lost / delete */}
          <div className="flex flex-col gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {onStatusChange && deal.status === 'active' && (
              <>
                <button
                  type="button"
                  title="Mark as Won"
                  className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(deal, 'won');
                  }}
                >
                  <Trophy size={12} />
                </button>
                <button
                  type="button"
                  title="Mark as Lost"
                  className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(deal, 'lost');
                  }}
                >
                  <XCircle size={12} />
                </button>
              </>
            )}
            <button
              type="button"
              title="Delete deal"
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(deal.id);
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
