'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Activity, Trophy, XCircle, PauseCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type Status = 'active' | 'won' | 'lost' | 'on_hold';

interface StatusMeta {
  label: string;
  Icon: React.ElementType;
  badgeClass: string;
  buttonClass: string;
}

const STATUS_META: Record<Status, StatusMeta> = {
  active: {
    label: 'Active',
    Icon: Activity,
    badgeClass:
      'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
    buttonClass:
      'hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-500/15 dark:hover:text-blue-400',
  },
  won: {
    label: 'Won',
    Icon: Trophy,
    badgeClass:
      'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
    buttonClass:
      'hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-400',
  },
  lost: {
    label: 'Lost',
    Icon: XCircle,
    badgeClass:
      'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400',
    buttonClass:
      'hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/15 dark:hover:text-red-400',
  },
  on_hold: {
    label: 'On Hold',
    Icon: PauseCircle,
    badgeClass:
      'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    buttonClass:
      'hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-500/15 dark:hover:text-amber-400',
  },
};

const ALL_STATUSES: Status[] = ['active', 'won', 'lost', 'on_hold'];

const WON_REASONS = ['Price', 'Relationship', 'Speed', 'Location', 'Other'];
const LOST_REASONS = [
  'Price too high',
  'Financing fell through',
  'Chose another agent',
  'Timing',
  'Property issue',
  'Other',
];

interface DealStatusControlProps {
  dealId: string;
  initialStatus: Status;
  onStatusChange?: (newStatus: string) => void;
}

export function DealStatusControl({
  dealId,
  initialStatus,
  onStatusChange,
}: DealStatusControlProps) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [open, setOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<'won' | 'lost' | null>(null);
  const [selectedReason, setSelectedReason] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closePanel();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function closePanel() {
    setOpen(false);
    setPendingStatus(null);
    setSelectedReason('');
    setNote('');
  }

  async function applyStatus(
    newStatus: Status,
    wonLostReason?: string,
    wonLostNote?: string,
  ) {
    const previous = status;
    // Optimistic update so the badge reflects the new value immediately
    setStatus(newStatus);
    setSaving(true);

    try {
      const body: Record<string, string | undefined> = { status: newStatus };
      if (wonLostReason) body.wonLostReason = wonLostReason;
      if (wonLostNote?.trim()) body.wonLostNote = wonLostNote.trim();

      const res = await fetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to update status');

      onStatusChange?.(newStatus);
      closePanel();
    } catch {
      // Roll back the optimistic update
      setStatus(previous);
      toast.error("Couldn't update the status. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleStatusClick(s: Status) {
    if (s === 'active' || s === 'on_hold') {
      applyStatus(s);
    } else {
      setPendingStatus(s);
      setSelectedReason('');
      setNote('');
    }
  }

  const reasons = pendingStatus === 'won' ? WON_REASONS : LOST_REASONS;
  const currentMeta = STATUS_META[status];
  const CurrentIcon = currentMeta.Icon;

  return (
    <div ref={containerRef} className="relative w-fit">
      {/* Status badge / toggle button */}
      <button
        type="button"
        onClick={() => (open ? closePanel() : setOpen(true))}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity',
          currentMeta.badgeClass,
          saving && 'opacity-50 pointer-events-none',
        )}
      >
        <CurrentIcon size={11} />
        {currentMeta.label}
      </button>

      {/* Inline panel */}
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-20 w-56 rounded-xl border border-border bg-popover shadow-md p-2">
          {/* Status option buttons */}
          {!pendingStatus && (
            <div className="space-y-0.5">
              {ALL_STATUSES.map((s) => {
                const meta = STATUS_META[s];
                const Icon = meta.Icon;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleStatusClick(s)}
                    disabled={saving}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-left transition-colors text-foreground',
                      s === status
                        ? meta.badgeClass
                        : cn('hover:bg-muted', meta.buttonClass),
                    )}
                  >
                    <Icon size={12} />
                    {meta.label}
                    {s === status && (
                      <span className="ml-auto text-[10px] opacity-60">current</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Won / Lost reason selection */}
          {pendingStatus && (
            <div className="space-y-2.5">
              <p className="text-xs font-semibold px-0.5">
                {pendingStatus === 'won' ? 'Why did you win?' : 'Why was it lost?'}
              </p>

              {/* Reason pills */}
              <div className="flex flex-wrap gap-1.5">
                {reasons.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSelectedReason(r)}
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                      selectedReason === r
                        ? pendingStatus === 'won'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                          : 'border-red-500 bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                        : 'border-border bg-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>

              {/* Optional note */}
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note (optional)"
                rows={2}
                className="resize-none text-xs"
              />

              {/* Actions */}
              <div className="flex items-center gap-2 pt-0.5">
                <Button
                  size="sm"
                  disabled={!selectedReason || saving}
                  onClick={() => applyStatus(pendingStatus, selectedReason, note)}
                  className="h-7 text-xs"
                >
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={closePanel}
                  className="h-7 text-xs"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
