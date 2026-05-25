'use client';

import { toast } from 'sonner';
import { DealInlineField } from './deal-inline-field';

interface Props {
  dealId: string;
  initial: string | null;
}

/**
 * Close-date field that offers to shift unchecked checklist items when the
 * date moves. Built on top of the generic DealInlineField — the wrapper just
 * watches for closeDate changes and fires a toast-with-action so the user
 * opts in explicitly (rather than silent-shift, which could quietly break a
 * contractually-fixed deadline).
 */
export function DealCloseDateField({ dealId, initial }: Props) {
  async function runShift(days: number) {
    try {
      const res = await fetch(`/api/deals/${dealId}/checklist/shift`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      });
      if (!res.ok) {
        toast.error("Couldn't shift the checklist.");
        return;
      }
      const data = await res.json();
      if (data.updated > 0) {
        toast.success(`Shifted ${data.updated} checklist item${data.updated === 1 ? '' : 's'}.`);
      } else {
        toast.message('Nothing to shift — all items are either done or dateless.');
      }
    } catch {
      toast.error("Couldn't shift the checklist.");
    }
  }

  function handleSaved(next: string | number | null, previous: string | number | null) {
    // Only proceed on same-type transitions (YYYY-MM-DD strings) or null <-> date.
    const nextDate = typeof next === 'string' ? new Date(next) : null;
    const prevDate = typeof previous === 'string' ? new Date(previous) : null;
    if (!nextDate || !prevDate) return;           // no shift if either bound is missing
    if (isNaN(nextDate.getTime()) || isNaN(prevDate.getTime())) return;

    const days = Math.round((nextDate.getTime() - prevDate.getTime()) / 86_400_000);
    if (days === 0) return;

    const direction = days > 0 ? 'later' : 'earlier';
    toast(`Close date moved ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ${direction}.`, {
      description: 'Shift unchecked checklist items by the same amount?',
      action: { label: 'Shift', onClick: () => runShift(days) },
      cancel: { label: 'Keep', onClick: () => undefined },
      duration: 8000,
    });
  }

  return (
    <DealInlineField
      dealId={dealId}
      field="closeDate"
      value={initial ? initial.substring(0, 10) : null}
      type="date"
      label="Close Date"
      displayValue={
        initial
          ? new Date(initial).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : ''
      }
      placeholder="Not set"
      onSaved={handleSaved}
    />
  );
}
