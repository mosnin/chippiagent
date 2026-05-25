import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';

interface AgentTask {
  id: string;
  spaceId: string;
  title: string;
  goalDescription: string | null;
  status: TaskStatus;
  estimatedCostUsd: number;
  createdAt: string;
  completedAt: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function statusBadge(status: TaskStatus) {
  const map: Record<TaskStatus, { label: string; classes: string }> = {
    queued:    { label: 'Queued',    classes: 'bg-muted text-muted-foreground' },
    running:   { label: 'Running',   classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
    completed: { label: 'Completed', classes: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
    failed:    { label: 'Failed',    classes: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
    cancelled: { label: 'Cancelled', classes: 'bg-muted text-muted-foreground/60' },
    paused:    { label: 'Paused',    classes: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-500' },
  };
  const { label, classes } = map[status] ?? map.queued;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', classes)}>
      {label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AgentTasksPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Verify the authenticated user owns this space.
  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  const { data: tasks, error } = await supabase
    .from('AgentTask')
    .select('*')
    .eq('spaceId', space.id)
    .order('createdAt', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[chippi/tasks] query error:', error);
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">We couldn&apos;t load your tasks. This is usually temporary.</p>
          <a
            href={`/s/${slug}/chippi/tasks`}
            className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  const taskList = (tasks ?? []) as AgentTask[];

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <header className="space-y-1">
        <Link
          href={`/s/${slug}/chippi`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={12} /> Chippi
        </Link>
        <h1
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          Agent Tasks
        </h1>
        <p className="text-sm text-muted-foreground">
          Long-running goals Chippi is working on
        </p>
      </header>

      {/* Pending approvals link */}
      <div className="flex items-center justify-end">
        <Link
          href={`/s/${slug}/chippi/approvals`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Pending approvals →
        </Link>
      </div>

      {/* Task list */}
      {taskList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No tasks yet. Ask Chippi to work on a complex goal and it will appear here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {taskList.map((task) => {
            const goal = task.goalDescription ?? task.title;
            const truncated = goal.length > 120 ? goal.slice(0, 120) + '…' : goal;
            const cost = typeof task.estimatedCostUsd === 'number' ? task.estimatedCostUsd : Number(task.estimatedCostUsd);

            return (
              <li key={task.id}>
                <Link
                  href={`/s/${slug}/chippi/tasks/${task.id}`}
                  className="flex items-start gap-3 py-4 hover:bg-muted/30 transition-colors -mx-2 px-2 rounded-md"
                >
                  {/* Status badge */}
                  <div className="pt-0.5 flex-shrink-0">
                    {statusBadge(task.status)}
                  </div>

                  {/* Goal text + meta */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm text-foreground leading-snug">{truncated}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {relativeTime(task.createdAt)}
                      {cost > 0 && (
                        <span className="ml-3">${cost.toFixed(2)}</span>
                      )}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
