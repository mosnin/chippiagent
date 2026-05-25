'use client';

import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/ui/confirm-dialog';
import type { CustomAgent } from '@/lib/swarm-types';

interface AgentListCardProps {
  agent: CustomAgent;
  slug: string;
  onDelete: (id: string) => void;
}

export function AgentListCard({ agent, slug, onDelete }: AgentListCardProps) {
  const { confirm, ConfirmDialog } = useConfirm();

  const initials = agent.name.slice(0, 2).toUpperCase();

  // Find a short model label for the badge
  const modelShort = agent.model.replace('gpt-', '').replace('-mini', ' mini');

  async function handleDelete() {
    const confirmed = await confirm({
      title: 'Delete agent?',
      description: `"${agent.name}" will be permanently removed.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/custom-agents/${agent.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed.');
      toast.success(`Agent removed.`);
      onDelete(agent.id);
    } catch {
      toast.error('Could not delete agent.');
    }
  }

  return (
    <>
      {ConfirmDialog}
      <div className="rounded-xl border border-border/60 bg-card p-5 flex items-start gap-4">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-sm font-semibold text-foreground shrink-0 select-none">
          {initials}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground leading-none">{agent.name}</p>
          {agent.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">{agent.description}</p>
          )}
          <span
            className={cn(
              'inline-flex text-[11px] font-medium rounded-full px-2 py-0.5',
              'bg-muted text-muted-foreground',
            )}
          >
            {modelShort}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Link
            href={`/s/${slug}/agents/${agent.id}`}
            className={cn(
              'inline-flex items-center justify-center size-8 rounded-md',
              'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
              'transition-colors duration-150',
            )}
            aria-label="Edit agent"
          >
            <Pencil className="size-4" />
          </Link>
          <button
            type="button"
            onClick={handleDelete}
            className={cn(
              'inline-flex items-center justify-center size-8 rounded-md',
              'text-muted-foreground hover:text-destructive hover:bg-destructive/[0.06]',
              'transition-colors duration-150',
            )}
            aria-label="Delete agent"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </>
  );
}
