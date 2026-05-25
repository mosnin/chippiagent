'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, X, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DealMilestone } from '@/lib/types';

interface DealMilestonesProps {
  dealId: string;
  initialMilestones: DealMilestone[];
}

const DEFAULT_MILESTONES: Omit<DealMilestone, 'id'>[] = [
  { label: 'Inspection period ends', dueDate: null, completed: false, completedAt: null },
  { label: 'Financing contingency deadline', dueDate: null, completed: false, completedAt: null },
  { label: 'Appraisal ordered', dueDate: null, completed: false, completedAt: null },
  { label: 'Title search complete', dueDate: null, completed: false, completedAt: null },
  { label: 'Final walkthrough', dueDate: null, completed: false, completedAt: null },
  { label: 'Closing', dueDate: null, completed: false, completedAt: null },
];

export function DealMilestones({ dealId, initialMilestones }: DealMilestonesProps) {
  const [milestones, setMilestones] = useState<DealMilestone[]>(initialMilestones);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const saveMilestonesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveMilestonesBaseRef = useRef<DealMilestone[] | null>(null);
  const labelEditCancelledRef = useRef(false);

  // Clear pending save on unmount
  useEffect(() => {
    return () => {
      if (saveMilestonesTimeoutRef.current) {
        clearTimeout(saveMilestonesTimeoutRef.current);
      }
      saveMilestonesBaseRef.current = null;
    };
  }, []);

  const saveMilestones = useCallback(async (updated: DealMilestone[], previous: DealMilestone[]) => {
    // On the first call in a debounce sequence, capture the pre-change baseline for rollback.
    // Subsequent calls within the debounce window only update `updated`; the baseline stays fixed
    // so a failed save rolls back to the state before the entire debounced sequence.
    if (!saveMilestonesTimeoutRef.current) {
      saveMilestonesBaseRef.current = previous;
    }
    if (saveMilestonesTimeoutRef.current) clearTimeout(saveMilestonesTimeoutRef.current);
    saveMilestonesTimeoutRef.current = setTimeout(async () => {
      saveMilestonesTimeoutRef.current = null;
      const baseline = saveMilestonesBaseRef.current ?? previous;
      saveMilestonesBaseRef.current = null;
      try {
        const res = await fetch(`/api/deals/${dealId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ milestones: updated }),
        });
        if (!res.ok) {
          setMilestones(baseline);
          toast.error("Couldn't save the milestones. Try again.");
        }
      } catch {
        setMilestones(baseline);
        toast.error("Couldn't save the milestones. Try again.");
      }
    }, 400);
  }, [dealId]);

  const completedCount = milestones.filter((m) => m.completed).length;
  const totalCount = milestones.length;

  return (
    <div className="space-y-3">
      {/* Progress header */}
      {milestones.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Transaction Checklist
          </span>
          <span className={cn(
            'text-xs font-semibold px-2 py-0.5 rounded-full',
            completedCount === totalCount
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
              : 'bg-muted text-muted-foreground'
          )}>
            {completedCount} / {totalCount} complete
          </span>
        </div>
      )}

      {/* Empty state */}
      {milestones.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
          <ListChecks size={32} className="text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">No milestones yet.</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const previous = milestones;
              const seeded: DealMilestone[] = DEFAULT_MILESTONES.map((m) => ({
                ...m,
                id: crypto.randomUUID(),
              }));
              setMilestones(seeded);
              saveMilestones(seeded, previous);
            }}
          >
            Use template
          </Button>
        </div>
      )}

      {/* Checklist rows */}
      {milestones.length > 0 && (
        <div className="space-y-1">
          {milestones.map((milestone) => (
            <div
              key={milestone.id}
              className={cn(
                'group flex items-start gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted/50',
                milestone.completed && 'opacity-60'
              )}
            >
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={milestone.completed}
                onChange={(e) => {
                  const previous = milestones;
                  const updated = milestones.map((m) =>
                    m.id === milestone.id
                      ? {
                          ...m,
                          completed: e.target.checked,
                          completedAt: e.target.checked ? new Date().toISOString() : null,
                        }
                      : m
                  );
                  setMilestones(updated);
                  saveMilestones(updated, previous);
                }}
                className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer rounded border-input accent-primary"
              />

              {/* Label + date */}
              <div className="flex-1 min-w-0 space-y-1">
                {editingLabelId === milestone.id ? (
                  <input
                    autoFocus
                    type="text"
                    maxLength={120}
                    defaultValue={milestone.label}
                    className="w-full rounded border border-input bg-background px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    onBlur={(e) => {
                      if (labelEditCancelledRef.current) {
                        labelEditCancelledRef.current = false;
                        setEditingLabelId(null);
                        return;
                      }
                      const previous = milestones;
                      const newLabel = e.target.value.trim() || milestone.label;
                      const updated = milestones.map((m) =>
                        m.id === milestone.id ? { ...m, label: newLabel } : m
                      );
                      setMilestones(updated);
                      setEditingLabelId(null);
                      saveMilestones(updated, previous);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') {
                        labelEditCancelledRef.current = true;
                        e.currentTarget.blur();
                      }
                    }}
                  />
                ) : (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => setEditingLabelId(milestone.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setEditingLabelId(milestone.id);
                    }}
                    className={cn(
                      'block text-sm cursor-text leading-snug',
                      milestone.completed && 'line-through text-muted-foreground'
                    )}
                  >
                    {milestone.label}
                  </span>
                )}

                {/* Due date input */}
                <input
                  type="date"
                  value={milestone.dueDate ?? ''}
                  onChange={(e) => {
                    const previous = milestones;
                    const updated = milestones.map((m) =>
                      m.id === milestone.id
                        ? { ...m, dueDate: e.target.value || null }
                        : m
                    );
                    setMilestones(updated);
                    saveMilestones(updated, previous);
                  }}
                  className="text-xs text-muted-foreground border-0 bg-transparent p-0 focus:outline-none focus:ring-0 cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                  placeholder="No date"
                  title="Due date (optional)"
                />
              </div>

              {/* Delete button */}
              <button
                type="button"
                onClick={() => {
                  const previous = milestones;
                  const updated = milestones.filter((m) => m.id !== milestone.id);
                  setMilestones(updated);
                  if (editingLabelId === milestone.id) setEditingLabelId(null);
                  saveMilestones(updated, previous);
                }}
                className="flex-shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted transition-all"
                title="Remove milestone"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add milestone button */}
      {milestones.length > 0 && milestones.length < 20 && (
        <button
          type="button"
          onClick={() => {
            const newMilestone: DealMilestone = {
              id: crypto.randomUUID(),
              label: 'New milestone',
              dueDate: null,
              completed: false,
              completedAt: null,
            };
            const previous = milestones;
            const updated = [...milestones, newMilestone];
            setMilestones(updated);
            setEditingLabelId(newMilestone.id);
            saveMilestones(updated, previous);
          }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-muted w-full"
        >
          <Plus size={14} />
          Add milestone
        </button>
      )}
    </div>
  );
}
