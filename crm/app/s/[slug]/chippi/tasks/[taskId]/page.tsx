import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { ArrowLeft, Wrench, MessageCircle } from 'lucide-react';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

interface AgentTask {
  id: string;
  spaceId: string;
  title: string;
  goalDescription: string | null;
  status: TaskStatus;
  estimatedCostUsd: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  metadata: Record<string, unknown> | null;
  // result is not in the base schema; may be stored in metadata
  result?: string | null;
}

interface ExecutionStep {
  id: string;
  taskId: string;
  stepIndex: number;
  toolName: string;
  stepType: string | null;
  inputSummary: string | null;
  outputSummary: string | null;
  toolArgs: Record<string, unknown> | null;
  toolResult: Record<string, unknown> | null;
  status: StepStatus;
  costUsd: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
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

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(startedAt: string | null, completedAt: string | null): string | null {
  if (!startedAt || !completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
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

function stepStatusDot(status: StepStatus) {
  const map: Record<StepStatus, string> = {
    pending:   'bg-muted-foreground/40',
    running:   'bg-blue-500',
    completed: 'bg-green-500',
    failed:    'bg-red-500',
    skipped:   'bg-muted-foreground/30',
  };
  return (
    <span
      className={cn('mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0', map[status] ?? map.pending)}
      aria-hidden
    />
  );
}

function truncate(s: string | null | undefined, max = 200): string {
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AgentTaskDetailPage({
  params,
}: {
  params: Promise<{ slug: string; taskId: string }>;
}) {
  const { slug, taskId } = await params;
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

  // Fetch task + steps in parallel.
  const [taskResult, stepsResult] = await Promise.all([
    supabase
      .from('AgentTask')
      .select('*')
      .eq('id', taskId)
      .eq('spaceId', space.id)
      .maybeSingle(),
    supabase
      .from('ExecutionStep')
      .select('*')
      .eq('taskId', taskId)
      .order('startedAt', { ascending: true }),
  ]);

  if (taskResult.error) {
    console.error('[chippi/tasks/[taskId]] task fetch error:', taskResult.error);
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">We couldn&apos;t load this task. This is usually temporary.</p>
          <a
            href={`/s/${slug}/chippi/tasks`}
            className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            All tasks
          </a>
        </div>
      </div>
    );
  }

  if (!taskResult.data) notFound();

  const task = taskResult.data as AgentTask;
  const steps = (stepsResult.data ?? []) as ExecutionStep[];

  const cost =
    typeof task.estimatedCostUsd === 'number'
      ? task.estimatedCostUsd
      : Number(task.estimatedCostUsd);

  // Result may be stored at the top level (if the schema evolves) or in metadata.
  const resultText: string | null =
    task.result ??
    (task.metadata && typeof (task.metadata as Record<string, unknown>).result === 'string'
      ? ((task.metadata as Record<string, unknown>).result as string)
      : null);

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <header className="space-y-3">
        <Link
          href={`/s/${slug}/chippi/tasks`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={12} /> All Tasks
        </Link>

        <h1
          className="text-3xl tracking-tight text-foreground leading-snug"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          {task.goalDescription ?? task.title}
        </h1>

        {/* Status + cost */}
        <div className="flex flex-wrap items-center gap-3">
          {statusBadge(task.status)}
          {cost > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">${cost.toFixed(2)}</span>
          )}
        </div>

        {/* Timestamps */}
        <p className="text-xs text-muted-foreground tabular-nums space-x-3">
          <span>Created {relativeTime(task.createdAt)} · {formatAbsolute(task.createdAt)}</span>
          {task.completedAt && (
            <span>· Completed {formatAbsolute(task.completedAt)}</span>
          )}
          {task.cancelledAt && (
            <span>· Cancelled {formatAbsolute(task.cancelledAt)}</span>
          )}
        </p>
      </header>

      {/* Execution steps */}
      <section className="border-t border-border/60 pt-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">
          Execution steps
          {steps.length > 0 && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({steps.length})
            </span>
          )}
        </h2>

        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No steps recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {steps.map((step) => {
              const isToolCall =
                step.stepType === 'tool_call' ||
                (!step.stepType && step.toolName);
              const isLlmCall = step.stepType === 'llm_call';
              const duration = formatDuration(step.startedAt, step.completedAt);

              // Input summary: prefer explicit inputSummary, fall back to toolArgs
              const inputText =
                step.inputSummary ??
                (step.toolArgs ? JSON.stringify(step.toolArgs).slice(0, 200) : null);

              // Output summary: prefer explicit outputSummary, fall back to toolResult
              const outputText =
                step.status === 'completed'
                  ? (step.outputSummary ??
                      (step.toolResult ? JSON.stringify(step.toolResult).slice(0, 200) : null))
                  : null;

              return (
                <li key={step.id} className="flex items-start gap-3 py-3">
                  {/* Status dot */}
                  {stepStatusDot(step.status)}

                  <div className="flex-1 min-w-0 space-y-0.5">
                    {/* Tool name + type icon */}
                    <div className="flex items-center gap-1.5">
                      {isLlmCall ? (
                        <MessageCircle size={12} className="flex-shrink-0 text-muted-foreground" />
                      ) : (
                        <Wrench size={12} className="flex-shrink-0 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium text-foreground">
                        {step.toolName}
                      </span>
                    </div>

                    {/* Input summary */}
                    {inputText && (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {truncate(inputText, 200)}
                      </p>
                    )}

                    {/* Output summary (completed only) */}
                    {outputText && (
                      <p className="text-xs text-foreground/70 leading-relaxed">
                        {truncate(outputText, 200)}
                      </p>
                    )}

                    {/* Error message */}
                    {step.status === 'failed' && step.errorMessage && (
                      <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
                        {truncate(step.errorMessage, 200)}
                      </p>
                    )}

                    {/* Status + duration + cost */}
                    <p className="text-xs text-muted-foreground/70 tabular-nums space-x-2">
                      <span>{step.status}</span>
                      {duration && <span>· {duration}</span>}
                      {step.costUsd > 0 && (
                        <span>· ${Number(step.costUsd).toFixed(4)}</span>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Result section */}
      {resultText && (
        <section className="border-t border-border/60 pt-6 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Result</h2>
          <div className="rounded-md bg-muted/40 border border-border/60 px-4 py-3">
            <pre className="text-sm text-muted-foreground whitespace-pre-wrap break-words font-mono leading-relaxed">
              {resultText}
            </pre>
          </div>
        </section>
      )}
    </div>
  );
}
