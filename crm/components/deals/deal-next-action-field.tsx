'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Calendar, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DealNextActionFieldProps {
  dealId: string;
  initialAction: string | null;
  initialDueAt: string | null;
}

/**
 * Inline-editable "next action" prompt shown at the top of the deal detail
 * Overview tab. Two fields (text + date) but they save together — the realtor
 * types what they'll do and when, one save button.
 */
export function DealNextActionField({ dealId, initialAction, initialDueAt }: DealNextActionFieldProps) {
  const [action, setAction] = useState(initialAction ?? '');
  const [dueAt, setDueAt] = useState(initialDueAt ? new Date(initialDueAt).toISOString().slice(0, 10) : '');
  const [savedAction, setSavedAction] = useState(initialAction ?? '');
  const [savedDueAt, setSavedDueAt] = useState(initialDueAt ?? '');
  const [saving, setSaving] = useState(false);

  const dirty = action !== savedAction || (dueAt ? new Date(dueAt).toISOString().slice(0, 10) : '') !==
    (savedDueAt ? new Date(savedDueAt).toISOString().slice(0, 10) : '');

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nextAction: action.trim() || null,
          nextActionDueAt: dueAt ? new Date(dueAt).toISOString() : null,
        }),
      });
      if (!res.ok) {
        toast.error("Couldn't save the next action.");
        return;
      }
      setSavedAction(action.trim());
      setSavedDueAt(dueAt ? new Date(dueAt).toISOString() : '');
      toast.success('Next action saved.');
    } finally {
      setSaving(false);
    }
  }

  async function clearAction() {
    setAction('');
    setDueAt('');
    setSaving(true);
    try {
      await fetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextAction: null, nextActionDueAt: null }),
      });
      setSavedAction('');
      setSavedDueAt('');
    } finally {
      setSaving(false);
    }
  }

  // Overdue highlight — drives the border colour of the wrapper.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = savedDueAt ? new Date(savedDueAt) : null;
  const overdue = !!(savedAction && dueDate && !isNaN(dueDate.getTime()) && dueDate.getTime() < today.getTime());

  return (
    <div className={cn(
      'rounded-lg border bg-card p-4',
      overdue ? 'border-red-200 dark:border-red-800' : 'border-border/70',
    )}>
      <div className="flex items-center gap-2 mb-2">
        <ArrowRight size={14} className="text-muted-foreground" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Next action
        </p>
        {overdue && (
          <span className="text-[10px] font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">
            Overdue
          </span>
        )}
      </div>

      <div className="space-y-2">
        <input
          type="text"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="What's the one thing you need to do next on this deal?"
          className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/60"
          maxLength={280}
          onKeyDown={(e) => { if (e.key === 'Enter' && dirty) save(); }}
        />

        <div className="flex items-center gap-2 text-xs">
          <Calendar size={12} className="text-muted-foreground" />
          <input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="text-xs bg-transparent border border-border rounded px-1.5 py-0.5"
            aria-label="Next action due date"
          />
          <div className="flex-1" />
          {(savedAction || savedDueAt) && !dirty && (
            <button
              type="button"
              onClick={clearAction}
              disabled={saving}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors"
            >
              <X size={11} /> Clear
            </button>
          )}
          {dirty && (
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md bg-foreground text-background text-[11px] font-semibold px-2 py-1 disabled:opacity-50"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : null}
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
