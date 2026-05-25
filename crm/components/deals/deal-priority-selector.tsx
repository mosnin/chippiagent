'use client';

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH';

const PRIORITY_META: Record<Priority, { label: string; className: string }> = {
  LOW: { label: 'Low', className: 'text-muted-foreground bg-muted' },
  MEDIUM: { label: 'Medium', className: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10' },
  HIGH: { label: 'High', className: 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/10' },
};

interface DealPrioritySelectorProps {
  dealId: string;
  initialPriority: Priority;
}

export function DealPrioritySelector({ dealId, initialPriority }: DealPrioritySelectorProps) {
  const [priority, setPriority] = useState<Priority>(initialPriority);
  const [saving, setSaving] = useState(false);

  async function handleChange(value: string) {
    const next = value as Priority;
    const previous = priority;
    // Optimistic update so the badge reflects the new value immediately
    setPriority(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: next }),
      });
      if (!res.ok) {
        setPriority(previous);
        toast.error("Couldn't update priority. Try again.");
      }
    } catch {
      setPriority(previous);
      toast.error("Couldn't update priority. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const meta = PRIORITY_META[priority];

  return (
    <Select value={priority} onValueChange={handleChange} disabled={saving}>
      <SelectTrigger className="h-auto w-auto border-none shadow-none p-0 focus:ring-0 focus:ring-offset-0 [&>svg]:hidden">
        <SelectValue asChild>
          <span
            className={cn(
              'inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-md cursor-pointer',
              meta.className,
            )}
          >
            {meta.label}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(PRIORITY_META) as Priority[]).map((p) => (
          <SelectItem key={p} value={p}>
            <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', PRIORITY_META[p].className)}>
              {PRIORITY_META[p].label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
