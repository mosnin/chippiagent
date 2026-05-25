import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { ArrowLeft, Clock } from 'lucide-react';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { ApprovalActions } from './approval-actions';

// ── Types ─────────────────────────────────────────────────────────────────────

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

function pendingActionLabel(metadata: Record<string, unknown> | null): string {
  if (!metadata) return 'Action requires your approval';
  const action = metadata['pendingAction'];
  if (typeof action === 'string' && action.trim().length > 0) return action.trim();
  return 'Action requires your approval';
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ApprovalsPage({
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
    .eq('status', 'paused')
    .not('metadata->approvalRequired', 'is', null)
    .order('createdAt', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[chippi/approvals] query error:', error);
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t load your pending approvals. This is usually temporary.
          </p>
          <a
            href={`/s/${slug}/chippi/approvals`}
            className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  const approvalList = (tasks ?? []) as ApprovalTask[];
  const pendingCount = approvalList.length;
  const statusSentence =
    pendingCount === 0
      ? 'Nothing waiting. Chippi will ask before any risky action.'
      : pendingCount === 1
        ? '1 action is waiting for your decision.'
        : `${pendingCount} actions are waiting for your decision.`;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header — three-line pattern per STYLESHEET.md */}
      <header className="space-y-1.5">
        <Link
          href={`/s/${slug}/chippi/tasks`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={12} /> Agent Tasks
        </Link>
        <h1
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          Pending Approvals
        </h1>
        <p className="text-sm text-muted-foreground">{statusSentence}</p>
      </header>

      {/* Approval list */}
      {approvalList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
          <p className="text-sm text-foreground">No pending approvals.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Chippi will ask before sending emails, archiving contacts, or any other risky action.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {approvalList.map((task) => {
            const goal = task.goalDescription ?? task.title;
            const truncated = goal.length > 100 ? goal.slice(0, 100) + '…' : goal;
            const actionLabel = pendingActionLabel(task.metadata);
            const waitingTime = relativeTime(task.updatedAt ?? task.createdAt);

            return (
              <li key={task.id} className="py-4 space-y-3">
                {/* Top row: status badge + goal */}
                <div className="flex items-start gap-3">
                  <div className="pt-0.5 flex-shrink-0">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                        'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
                      )}
                    >
                      Waiting
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm text-foreground leading-snug">{truncated}</p>
                    <p className="text-xs text-muted-foreground">{actionLabel}</p>
                  </div>
                </div>

                {/* Time waiting */}
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums pl-0.5">
                  <Clock size={11} className="flex-shrink-0" />
                  <span>Waiting {waitingTime}</span>
                </div>

                {/* Approve / Reject actions (client component) */}
                <ApprovalActions taskId={task.id} slug={slug} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
