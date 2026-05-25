import { redirect, notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { AgentBuilderForm } from '@/components/agents/agent-builder-form';

export const metadata = { title: 'New Agent — Chippi' };

export default async function NewAgentPage({
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

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold">New Agent</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a specialized AI agent for your swarms.
        </p>
      </div>
      <AgentBuilderForm slug={slug} spaceId={space.id} />
    </div>
  );
}
