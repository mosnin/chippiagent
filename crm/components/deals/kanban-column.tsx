'use client';

import { useEffect, useRef, useState } from 'react';

import { useDndContext, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { DealCard } from './deal-card';
import { Input } from '@/components/ui/input';
import { Plus, SquarePen, Trash2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatCompact } from '@/lib/formatting';
import type { Deal, DealStage, Contact, DealContact } from '@/lib/types';

type DealWithRelations = Deal & {
  stage: DealStage;
  dealContacts: (DealContact & { contact: Pick<Contact, 'id' | 'name'> })[];
};

interface KanbanColumnProps {
  stage: DealStage;
  deals: DealWithRelations[];
  slug: string;
  onAddDeal: (stageId: string) => void;
  onDeleteDeal: (id: string) => void;
  onDeleteStage: (stage: DealStage) => void;
  onDealCreated: () => void;
  onStatusChange?: (
    deal: DealWithRelations,
    status: 'won' | 'lost' | 'on_hold' | 'active',
  ) => void;
  /** The stage immediately after this one in the pipeline order. Null if this is the last stage. */
  nextStage?: DealStage | null;
  /** Called when a card's Advance button is clicked. */
  onAdvanceStage?: (deal: DealWithRelations, nextStageId: string) => void;
  /** Open the deal slide-over panel from a card click. */
  onOpenDeal?: (deal: DealWithRelations) => void;
  /** Spread onto the drag handle element to enable column reordering */
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}

export function KanbanColumn({
  stage,
  deals,
  slug,
  onAddDeal,
  onDeleteDeal,
  onDeleteStage,
  onDealCreated,
  onStatusChange,
  nextStage,
  onAdvanceStage,
  onOpenDeal,
  dragHandleProps,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const { active } = useDndContext();
  const isCardDragging = !!active && !active.id.toString().startsWith('stage:');

  const totalValue = deals.reduce((s, d) => s + (d.value ?? 0), 0);

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const submittedRef = useRef(false);

  function focusInput() {
    const el = containerRef.current?.querySelector<HTMLInputElement>(
      'input[data-slot="input"]',
    );
    el?.focus();
  }

  useEffect(() => {
    if (!quickAddOpen) return;
    function onDocPointer(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        cancelQuickAdd();
      }
    }
    document.addEventListener('mousedown', onDocPointer);
    return () => document.removeEventListener('mousedown', onDocPointer);
  }, [quickAddOpen]);

  function cancelQuickAdd() {
    setQuickAddOpen(false);
    setQuickAddTitle('');
  }

  async function submitQuickAdd() {
    const title = quickAddTitle.trim();
    if (!title || submitting) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          title,
          stageId: stage.id,
          priority: 'MEDIUM',
        }),
      });
      if (!res.ok) {
        toast.error("Couldn't create that deal. Try again.");
        setSubmitting(false);
        submittedRef.current = false;
        focusInput();
        return;
      }
      toast.success('Deal added.');
      setQuickAddTitle('');
      setSubmitting(false);
      submittedRef.current = false;
      onDealCreated();
      focusInput();
    } catch {
      toast.error("Couldn't create that deal. Try again.");
      setSubmitting(false);
      submittedRef.current = false;
      focusInput();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitQuickAdd();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelQuickAdd();
    }
  }

  function onBlur() {
    setTimeout(() => {
      if (submittedRef.current || submitting) return;
      if (
        containerRef.current &&
        containerRef.current.contains(document.activeElement)
      )
        return;
      cancelQuickAdd();
    }, 0);
  }

  return (
    <div className="group/column flex flex-col w-72 flex-shrink-0">
      {/* Column header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2 min-w-0">
          {dragHandleProps && (
            <button
              type="button"
              title="Drag to reorder stage"
              aria-label={`Reorder stage ${stage.name}`}
              className="hidden md:flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 opacity-0 group-hover/column:opacity-100 hover:bg-foreground/[0.04] cursor-grab active:cursor-grabbing transition-opacity flex-shrink-0"
              {...dragHandleProps}
            >
              <GripVertical size={13} className="rotate-90" />
            </button>
          )}
          <span className="text-base font-semibold text-foreground truncate">
            {stage.name}
          </span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {deals.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {totalValue > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {formatCompact(totalValue)}
            </span>
          )}
          <button
            type="button"
            onClick={() => onDeleteStage(stage)}
            title="Delete stage"
            aria-label={`Delete stage ${stage.name}`}
            className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground/60 opacity-0 group-hover/column:opacity-100 hover:bg-foreground/[0.06] hover:text-foreground transition-[opacity,colors]"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Drop zone — paper-flat. Highlight only while a card is being dragged. */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 min-h-24 rounded-lg p-2 transition-colors duration-150',
          'bg-foreground/[0.02] border border-border/70',
          isCardDragging && isOver && 'bg-foreground/[0.04]',
        )}
      >
        <SortableContext
          items={deals.map((d) => d.id)}
          strategy={verticalListSortingStrategy}
        >
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              slug={slug}
              onDelete={onDeleteDeal}
              onStatusChange={onStatusChange}
              nextStage={nextStage}
              onAdvanceStage={onAdvanceStage}
              onOpenDeal={onOpenDeal}
            />
          ))}
          {deals.length === 0 && !isOver && (
            <div className="flex items-center justify-center py-8 text-muted-foreground/40">
              <p className="text-xs">No deals</p>
            </div>
          )}
        </SortableContext>
      </div>

      <div ref={containerRef} className="mt-2">
        {quickAddOpen ? (
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={quickAddTitle}
              onChange={(e) => setQuickAddTitle(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={onBlur}
              placeholder="Deal title…"
              disabled={submitting}
              className="h-8 text-sm"
              aria-label={`Quick add deal to ${stage.name}`}
            />
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                cancelQuickAdd();
                onAddDeal(stage.id);
              }}
              title="Open full form"
              className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
            >
              <SquarePen size={13} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="flex-1 flex items-center gap-1.5 px-2 py-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
              onClick={() => setQuickAddOpen(true)}
            >
              <Plus size={13} />
              Add deal
            </button>
            <button
              type="button"
              onClick={() => onAddDeal(stage.id)}
              title="Open full form"
              className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
            >
              <SquarePen size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
