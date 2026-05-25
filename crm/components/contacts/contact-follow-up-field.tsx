'use client';

import { useState } from 'react';
import { CalendarDays, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatFollowUpDate, toDateInputValue, timeAgo } from '@/lib/formatting';
import { SNOOZE_OPTIONS, snoozeDateFromHours } from '@/components/follow-ups/follow-ups-view';

interface Props {
  contactId: string;
  followUpAt: string | null;
  lastContactedAt: string | null;
}

export function ContactFollowUpField({ contactId, followUpAt: initialFollowUpAt, lastContactedAt: initialLastContactedAt }: Props) {
  const [followUpAt, setFollowUpAt] = useState(initialFollowUpAt);
  const [lastContactedAt, setLastContactedAt] = useState(initialLastContactedAt);

  async function patch(data: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.ok;
    } catch (err) {
      console.error('[follow-up] Patch failed:', err);
      return false;
    }
  }

  async function handleFollowUpChange(value: string) {
    const next = value || null;
    const prev = followUpAt;
    setFollowUpAt(next);
    const ok = await patch({ followUpAt: next });
    if (!ok) setFollowUpAt(prev);
  }

  async function handleQuickSnooze(hours: number) {
    const prev = followUpAt;
    const next = snoozeDateFromHours(hours);
    setFollowUpAt(next);
    const ok = await patch({ followUpAt: next });
    if (!ok) setFollowUpAt(prev);
  }

  async function handleMarkContacted() {
    const prev = lastContactedAt;
    const now = new Date().toISOString();
    setLastContactedAt(now);
    const ok = await patch({ lastContactedAt: now });
    if (!ok) setLastContactedAt(prev);
  }

  const isOverdue = followUpAt && new Date(followUpAt) < new Date();

  return (
    <div className="flex flex-col gap-2">
      {/* Quick snooze buttons — one-click common follow-up windows */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {SNOOZE_OPTIONS.map((opt) => (
          <button
            key={opt.hours}
            type="button"
            onClick={() => handleQuickSnooze(opt.hours)}
            className="text-xs font-medium rounded-md px-2.5 py-1 bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
            title={`Follow up ${opt.label.toLowerCase()}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* Follow-up date (override) */}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer group/fu">
          <CalendarDays size={12} className="text-muted-foreground" />
          {followUpAt ? (
            <span className={cn('font-medium', isOverdue ? 'text-destructive' : 'text-foreground')}>
              {formatFollowUpDate(followUpAt)}
            </span>
          ) : (
            <span className="group-hover/fu:text-foreground transition-colors">Set follow-up</span>
          )}
          <input
            type="date"
            className="sr-only"
            value={toDateInputValue(followUpAt)}
            onChange={(e) => handleFollowUpChange(e.target.value)}
          />
        </label>

        {/* Mark contacted */}
        <button
          type="button"
          onClick={handleMarkContacted}
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-medium rounded-md px-3 py-1.5 transition-colors',
            lastContactedAt
              ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
              : 'text-muted-foreground bg-muted hover:text-foreground hover:bg-muted/80',
          )}
          title="Mark as contacted now"
        >
          <CheckCircle2 size={11} />
          {lastContactedAt ? `Contacted ${timeAgo(new Date(lastContactedAt))}` : 'Mark contacted'}
        </button>
      </div>
    </div>
  );
}
