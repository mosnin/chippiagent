'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Clock, UserPlus, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  contactId: string;
  initialReferralSource: string | null;
  initialSnoozedUntil: string | null;
}

/**
 * Sidebar card with two low-touch lifecycle fields realtors want:
 *   - referralSource: "who sent this lead" (free text)
 *   - snoozedUntil: park the contact out of the main view until a date
 *
 * Both patch via the existing /api/contacts/:id endpoint so the save path
 * is shared with every other contact field.
 */
export function ContactLifecycleFields({ contactId, initialReferralSource, initialSnoozedUntil }: Props) {
  const [source, setSource] = useState(initialReferralSource ?? '');
  const [savedSource, setSavedSource] = useState(initialReferralSource ?? '');
  const [snooze, setSnooze] = useState(initialSnoozedUntil ? new Date(initialSnoozedUntil).toISOString().slice(0, 10) : '');
  const [savingSource, setSavingSource] = useState(false);
  const [savingSnooze, setSavingSnooze] = useState(false);

  async function saveSource() {
    if (source.trim() === savedSource.trim()) return;
    setSavingSource(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralSource: source.trim() || null }),
      });
      if (!res.ok) { toast.error("Couldn't save the referral source."); return; }
      setSavedSource(source.trim());
    } finally {
      setSavingSource(false);
    }
  }

  async function saveSnooze(date: string | null) {
    setSavingSnooze(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snoozedUntil: date ?? null }),
      });
      if (!res.ok) { toast.error("Couldn't save that snooze."); return; }
      setSnooze(date ?? '');
      if (date) toast.success('Snoozed until ' + new Date(date).toLocaleDateString() + '.');
      else toast.success('Un-snoozed.');
    } finally {
      setSavingSnooze(false);
    }
  }

  const isSnoozed = snooze && new Date(snooze) > new Date();

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <p className="text-sm font-semibold">Lifecycle</p>

      {/* Referral source */}
      <div>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1" htmlFor={`ref-${contactId}`}>
          <UserPlus size={11} /> Referral source
        </label>
        <input
          id={`ref-${contactId}`}
          type="text"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onBlur={saveSource}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          placeholder="e.g. Jane Doe, Zillow, open house"
          maxLength={200}
          className="w-full text-sm bg-transparent outline-none border-b border-border focus:border-foreground py-1"
        />
        {savingSource && <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Saving</p>}
      </div>

      {/* Snooze */}
      <div>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1" htmlFor={`snooze-${contactId}`}>
          <Clock size={11} /> {isSnoozed ? `Snoozed until ${new Date(snooze).toLocaleDateString()}` : 'Snooze until'}
        </label>
        <div className="flex items-center gap-1.5">
          <input
            id={`snooze-${contactId}`}
            type="date"
            value={snooze}
            onChange={(e) => saveSnooze(e.target.value || null)}
            disabled={savingSnooze}
            className={cn(
              'flex-1 text-sm bg-transparent border border-border rounded px-2 py-1',
              isSnoozed && 'bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200',
            )}
          />
          {isSnoozed && (
            <button
              type="button"
              onClick={() => saveSnooze(null)}
              disabled={savingSnooze}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors px-1"
              title="Wake up now"
            >
              <X size={11} />
              Wake
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
