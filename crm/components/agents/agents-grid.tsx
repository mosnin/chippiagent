'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bot, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { AgentListCard } from './agent-list-card';
import type { CustomAgent } from '@/lib/swarm-types';

interface AgentsGridProps {
  initialAgents: CustomAgent[];
  slug: string;
  spaceId: string;
}

export function AgentsGrid({ initialAgents, slug, spaceId }: AgentsGridProps) {
  const [agents, setAgents] = useState<CustomAgent[]>(initialAgents);

  function handleDelete(id: string) {
    setAgents((prev) => prev.filter((a) => a.id !== id));
  }

  if (agents.length === 0) {
    return (
      <EmptyState
        icon={Bot}
        title="No agents yet."
        description="Create your first agent to get started with swarms."
        action={{
          label: 'Create Agent',
          href: `/s/${slug}/agents/new`,
        }}
      />
    );
  }

  return (
    <div className={cn('grid grid-cols-1 gap-4', 'md:grid-cols-2')}>
      {agents.map((agent) => (
        <AgentListCard
          key={agent.id}
          agent={agent}
          slug={slug}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}
