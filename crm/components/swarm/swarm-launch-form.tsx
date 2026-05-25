'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BODY_MUTED, SECTION_LABEL, PRIMARY_PILL } from '@/lib/typography';
import type { CustomAgent } from '@/lib/swarm-types';

interface SwarmLaunchFormProps {
  slug: string;
  availableAgents: CustomAgent[];
}

const EXAMPLE_PROMPTS = [
  'Research the top 5 zip codes by appreciation',
  'Draft follow-up sequences for cold leads',
  'Analyze my pipeline and suggest next actions',
] as const;

export function SwarmLaunchForm({ slug, availableAgents }: SwarmLaunchFormProps) {
  const router = useRouter();
  const [goal, setGoal] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleAgent(id: string) {
    setSelectedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = goal.trim();
    if (trimmed.length < 10) {
      setError('Describe what you want to accomplish — at least 10 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/swarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spaceId: slug,
          goal: trimmed,
          customAgentIds: Array.from(selectedAgentIds),
        }),
      });

      const data = (await res.json()) as { swarmRunId?: string; error?: string };

      if (!res.ok || !data.swarmRunId) {
        setError(data.error ?? 'Something went wrong. Try again.');
        return;
      }

      router.push(`/s/${slug}/swarm/${data.swarmRunId}`);
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Goal textarea */}
      <div className="space-y-2">
        <label
          htmlFor="swarm-goal"
          className="text-sm font-medium text-foreground"
        >
          What do you want your agent swarm to accomplish?
        </label>
        <textarea
          id="swarm-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Describe the goal in plain language."
          rows={5}
          className={cn(
            'w-full min-h-[120px] rounded-xl border border-border/60 bg-background',
            'p-4 text-sm resize-none',
            'placeholder:text-muted-foreground/70',
            'focus:outline-none focus:ring-2 focus:ring-ring',
            'transition-colors duration-150',
          )}
        />

        {/* Example prompts */}
        <div className="flex flex-wrap gap-2 pt-1">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setGoal(prompt)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full',
                'border border-border/70 bg-background hover:bg-accent/40 hover:border-border',
                'px-3 py-1',
                'text-[11px] text-muted-foreground hover:text-foreground',
                'transition-colors',
              )}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Agent picker */}
      {availableAgents.length > 0 && (
        <div className="space-y-3">
          <p className={cn(SECTION_LABEL)}>Select agents (optional)</p>
          <div className="flex flex-wrap gap-2">
            {availableAgents.map((agent) => {
              const isActive = selectedAgentIds.has(agent.id);
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => toggleAgent(agent.id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs cursor-pointer transition-colors',
                    isActive
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border/60 text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                >
                  {agent.name}
                </button>
              );
            })}
          </div>
          {selectedAgentIds.size > 0 && (
            <p className={cn(BODY_MUTED, 'text-xs')}>
              {selectedAgentIds.size} agent{selectedAgentIds.size !== 1 ? 's' : ''} selected.
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Submit */}
      <div>
        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(PRIMARY_PILL, 'disabled:opacity-50 disabled:cursor-not-allowed')}
        >
          {isSubmitting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <MessageCircle size={14} />
          )}
          {isSubmitting ? 'Launching…' : 'Launch Swarm'}
        </button>
      </div>
    </form>
  );
}
