'use client';

/**
 * ApprovalsPill — small status chip in the Chippi header that shows the
 * count of paused AgentTask rows awaiting human approval. Click → a Sheet
 * slides in from the right with the full list and inline approve/reject
 * actions. Empty state renders nothing so the header chrome stays calm.
 *
 * This is the agent-OS primitive surfaced where it has weight: the
 * blocking-work count lives next to the chat composer, not on a separate
 * page. The `/s/[slug]/chippi/approvals` route still works as a deep link,
 * but the realtor never has to navigate there.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronUp, Clock, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PulseNumber } from '@/components/ui/pulse-number';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface ApprovalTask {
  id: string;
  spaceId: string;
  title: string;
  goalDescription: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function pendingActionLabel(metadata: Record<string, unknown> | null): string {
  if (!metadata) return 'Action requires your approval';
  const action = metadata['pendingAction'];
  if (typeof action === 'string' && action.trim().length > 0) return action.trim();
  return 'Action requires your approval';
}

export function ApprovalsPill() {
  const [count, setCount] = useState(0);
  const [tasks, setTasks] = useState<ApprovalTask[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/chippi/approvals');
      if (!res.ok) return;
      const data = (await res.json()) as { count: number; tasks: ApprovalTask[] };
      setCount(data.count);
      setTasks(data.tasks);
    } catch {
      // Silent — the pill simply stays at its last known count.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchApprovals();
    const onFocus = () => void fetchApprovals();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchApprovals]);

  const handleAction = useCallback(
    async (taskId: string, action: 'approve' | 'reject') => {
      if (pendingTaskId) return;
      setPendingTaskId(taskId);
      try {
        const res = await fetch('/api/agent/approvals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, action }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg = (body as { error?: string }).error ?? 'Something went wrong.';
          toast.error(msg);
          return;
        }
        toast.success(action === 'approve' ? 'Approved. Chippi will continue.' : 'Rejected. Action cancelled.');
        // Optimistic update + refetch to confirm.
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
        setCount((c) => Math.max(0, c - 1));
        void fetchApprovals();
      } catch {
        toast.error("Couldn't reach Chippi. Try again.");
      } finally {
        setPendingTaskId(null);
      }
    },
    [pendingTaskId, fetchApprovals],
  );

  // Render nothing when there's nothing waiting — the calm-by-default rule.
  if (count === 0 && !open) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-1.5 mr-1 h-8 px-2.5 rounded-lg text-xs font-medium transition-colors',
          'bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25',
        )}
        title={count === 1 ? '1 action awaiting your approval' : `${count} actions awaiting your approval`}
        aria-label={`${count} approval${count === 1 ? '' : 's'} pending`}
      >
        <PulseNumber value={count} className="tabular-nums font-semibold" />
        <span className="hidden sm:inline">to approve</span>
        <ChevronUp size={12} className="opacity-70" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="px-5 py-4 border-b border-border/60">
            <SheetTitle className="text-lg">Waiting on you</SheetTitle>
            <SheetDescription>
              {count === 0
                ? 'Nothing waiting. Chippi will ask before any risky action.'
                : count === 1
                  ? '1 action paused for your decision.'
                  : `${count} actions paused for your decision.`}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {tasks.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  {loading ? 'Loading…' : 'Nothing waiting right now.'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {tasks.map((task) => {
                  const goal = task.goalDescription ?? task.title;
                  const truncated = goal.length > 140 ? goal.slice(0, 140) + '…' : goal;
                  const actionLabel = pendingActionLabel(task.metadata);
                  const waiting = relativeTime(task.updatedAt ?? task.createdAt);
                  const busy = pendingTaskId === task.id;

                  return (
                    <li key={task.id} className="px-5 py-4 space-y-3">
                      <div className="space-y-1">
                        <p className="text-sm text-foreground leading-snug">{truncated}</p>
                        <p className="text-xs text-muted-foreground">{actionLabel}</p>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
                        <Clock size={11} />
                        <span>Waiting {waiting}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleAction(task.id, 'approve')}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleAction(task.id, 'reject')}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
                        >
                          <X size={12} />
                          Reject
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
