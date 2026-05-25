import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { H1, TITLE_FONT, BODY_MUTED, PRIMARY_PILL } from '@/lib/typography';
import { AgentsGrid } from '@/components/agents/agents-grid';
import type { CustomAgent } from '@/lib/swarm-types';

export default async function AgentsPage({
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

  const { data, error } = await supabase
    .from('CustomAgent')
    .select('*')
    .eq('spaceId', space.id)
    .eq('isActive', true)
    .order('createdAt', { ascending: false });

  if (error) {
    console.error('[agents/page] query error:', error);
  }

  const agents = (data ?? []) as CustomAgent[];

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <p className={cn(BODY_MUTED)}>Swarms.</p>
          <h1 className={cn(H1)} style={TITLE_FONT}>
            Custom Agents
          </h1>
          <p className={cn(BODY_MUTED)}>
            Build specialized AI agents for your swarm.
          </p>
        </div>

        <Link
          href={`/s/${slug}/agents/new`}
          className={cn(PRIMARY_PILL, 'mt-1 shrink-0')}
        >
          <Plus className="size-4" />
          New Agent
        </Link>
      </header>

      {/* Grid or empty state */}
      <AgentsGrid
        initialAgents={agents}
        slug={slug}
        spaceId={space.id}
      />
    </div>
  );
}
