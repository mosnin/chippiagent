import { redirect, notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { AgentBuilderForm } from '@/components/agents/agent-builder-form';
import type { CustomAgent } from '@/lib/swarm-types';

export const metadata = { title: 'Edit Agent — Chippi' };

export default async function EditAgentPage({
  params,
}: {
  params: Promise<{ slug: string; agentId: string }>;
}) {
  const { slug, agentId } = await params;
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

  // Fetch the agent and verify it belongs to this space.
  const { data: agentData, error } = await supabase
    .from('CustomAgent')
    .select('*')
    .eq('id', agentId)
    .maybeSingle();

  if (error) {
    console.error('[agents/[agentId]] agent fetch error:', error);
    notFound();
  }

  const agent = agentData as CustomAgent | null;
  if (!agent || agent.spaceId !== space.id) notFound();

  return (
    <div className="max-w-2xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{agent.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {agent.description || 'No description'}
          </p>
        </div>
        <a
          href={`/s/${slug}/agents`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← All agents
        </a>
      </div>
      <AgentBuilderForm slug={slug} spaceId={space.id} initialAgent={agent} />
    </div>
  );
}
