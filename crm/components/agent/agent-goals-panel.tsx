'use client';

import { useEffect, useState } from 'react';
import { Plus, CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AgentGoal {
  id: string;
  goalType: string;
  description: string;
  instructions: string | null;
  status: 'active' | 'completed' | 'cancelled' | 'paused';
  priority: number;
  contactId: string | null;
  dealId: string | null;
  Contact: { id: string; name: string } | null;
  createdAt: string;
  completedAt: string | null;
}

const GOAL_TYPE_LABELS: Record<string, string> = {
  follow_up_sequence: 'Follow-up',
  tour_booking: 'Tour booking',
  offer_progress: 'Offer progress',
  reengagement: 'Re-engagement',
  custom: 'Custom',
};

const GOAL_TYPE_OPTIONS = [
  { value: 'follow_up_sequence', label: 'Follow-up sequence' },
  { value: 'tour_booking', label: 'Tour booking' },
  { value: 'offer_progress', label: 'Offer progress' },
  { value: 'reengagement', label: 'Re-engagement' },
  { value: 'custom', label: 'Custom' },
] as const;

// ─── GoalRow ──────────────────────────────────────────────────────────────────

function GoalRow({ goal, onAction }: { goal: AgentGoal; onAction: (id: string, status: 'completed' | 'cancelled') => Promise<void> }) {
  const [actioning, setActioning] = useState<'completed' | 'cancelled' | null>(null);
  const label = GOAL_TYPE_LABELS[goal.goalType] ?? GOAL_TYPE_LABELS.custom;
  const isHighPriority = goal.priority >= 8;

  async function handleAction(status: 'completed' | 'cancelled') {
    setActioning(status);
    try { await onAction(goal.id, status); }
    finally { setActioning(null); }
  }

  return (
    <div className="group/row flex items-start gap-4 py-4 first:pt-0 last:pb-0">
      <div className="flex-1 min-w-0">
        {/* Meta line */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{label}</span>
          {isHighPriority && (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              High priority
            </span>
          )}
          {goal.Contact && <span className="truncate">{goal.Contact.name}</span>}
        </div>

        <p className="mt-1 text-sm text-foreground leading-snug">{goal.description}</p>
        {goal.instructions && (
          <p className="mt-1 text-[12px] text-muted-foreground italic line-clamp-2">{goal.instructions}</p>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity pt-0.5">
        <button
          onClick={() => void handleAction('completed')}
          disabled={actioning !== null}
          title="Mark as completed"
          aria-label="Mark goal as completed"
          className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
        >
          <CheckCircle2 size={13} />
        </button>
        <button
          onClick={() => void handleAction('cancelled')}
          disabled={actioning !== null}
          title="Cancel goal"
          aria-label="Cancel goal"
          className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── NewGoalForm ──────────────────────────────────────────────────────────────

function NewGoalForm({ onSubmit, onCancel }: { onSubmit: (goalType: string, description: string) => Promise<void>; onCancel: () => void }) {
  const [goalType, setGoalType] = useState<string>('follow_up_sequence');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const descriptionTooShort = description.trim().length > 0 && description.trim().length < 10;
  const canSubmit = goalType && description.trim().length >= 10 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(goalType, description.trim());
    } catch {
      setError("Couldn't create that goal. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="py-5 border-t border-border/60">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <select
          value={goalType}
          onChange={(e) => setGoalType(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {GOAL_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Describe what Chippi should accomplish…"
          required
          className={cn(
            'w-full resize-none rounded-md border bg-background px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring',
            descriptionTooShort ? 'border-destructive' : 'border-border',
          )}
        />
        {descriptionTooShort && <p className="text-xs text-destructive">At least 10 characters required.</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity',
              !canSubmit && 'opacity-50 cursor-not-allowed',
            )}
          >
            <Plus size={11} />
            {submitting ? 'Creating…' : 'Create goal'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── AgentGoalsPanel ─────────────────────────────────────────────────────────

export function AgentGoalsPanel() {
  const [goals, setGoals] = useState<AgentGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/agent/goals?status=active&limit=50');
        if (res.ok) setGoals(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleAction(id: string, status: 'completed' | 'cancelled') {
    try {
      const res = await fetch(`/api/agent/goals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setGoals((prev) => prev.filter((g) => g.id !== id));
        if (status === 'completed') toast.success('Goal done.');
      } else {
        toast.error("Couldn't update that goal. Try again.");
        throw new Error('update failed');
      }
    } catch (err) {
      if (!(err instanceof Error && err.message === 'update failed')) {
        toast.error("I lost the connection. Try again.");
      }
      throw err;
    }
  }

  async function handleCreate(goalType: string, description: string) {
    const res = await fetch('/api/agent/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalType, description }),
    });
    if (!res.ok) throw new Error('Failed to create goal');
    const created: AgentGoal = await res.json();
    setGoals((prev) => [created, ...prev]);
    setShowForm(false);
  }

  return (
    <section>
      <div className="flex items-center gap-3 pb-3 border-b border-border/60">
        <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
          Goals
        </h2>
        {!loading && goals.length > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {goals.length}
          </span>
        )}
        <button
          onClick={() => setShowForm((v) => !v)}
          className={cn(
            'ml-auto inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors',
            showForm ? 'text-foreground bg-muted/60' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
          )}
        >
          <Plus size={11} />
          New goal
        </button>
      </div>

      {loading && (
        <div className="space-y-3 pt-5">
          {[1, 2].map((n) => <div key={n} className="h-12 rounded bg-muted/30 animate-pulse" />)}
        </div>
      )}

      {!loading && goals.length > 0 && (
        <div className="divide-y divide-border/60">
          {goals.map((goal) => (
            <GoalRow key={goal.id} goal={goal} onAction={handleAction} />
          ))}
        </div>
      )}

      {!loading && goals.length === 0 && !showForm && (
        <div className="py-8 text-sm text-muted-foreground">
          No active goals. Goals let you track multi-step objectives Chippi should work toward.
        </div>
      )}

      {showForm && <NewGoalForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />}
    </section>
  );
}
