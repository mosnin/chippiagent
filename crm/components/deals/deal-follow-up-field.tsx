'use client';

import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatFollowUpDate, toDateInputValue } from '@/lib/formatting';

interface DealFollowUpFieldProps {
  dealId: string;
  followUpAt: string | null;
  status: string;
}

export function DealFollowUpField({
  dealId,
  followUpAt: initialFollowUpAt,
  status,
}: DealFollowUpFieldProps) {
  const [followUpAt, setFollowUpAt] = useState(initialFollowUpAt);

  async function handleChange(value: string) {
    const next = value || null;
    const previous = followUpAt;
    setFollowUpAt(next);

    let res: Response;
    try {
      res = await fetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followUpAt: next }),
      });
    } catch {
      setFollowUpAt(previous);
      toast.error("I lost the connection. Check it and try again.");
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as { error?: string; message?: string }));
      const detail = body?.error || body?.message || `HTTP ${res.status}`;
      setFollowUpAt(previous);
      toast.error(`Couldn't save the follow-up: ${detail}`);
    }
  }

  const isOverdue = (() => {
    if (!followUpAt || status !== 'active') return false;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return new Date(followUpAt) < startOfToday;
  })();

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer group/fu w-fit">
      <CalendarDays size={12} className="flex-shrink-0 text-muted-foreground" />
      {followUpAt ? (
        <span
          className={cn(
            'font-medium',
            isOverdue ? 'text-destructive' : 'text-foreground',
          )}
        >
          {formatFollowUpDate(followUpAt)}
        </span>
      ) : (
        <span className="group-hover/fu:text-foreground transition-colors">
          Set follow-up
        </span>
      )}
      <input
        type="date"
        className="sr-only"
        value={toDateInputValue(followUpAt)}
        onChange={(e) => handleChange(e.target.value)}
      />
    </label>
  );
}
