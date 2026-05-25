import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import type { SwarmRun, SwarmMember } from '@/lib/swarm-types';
import { SwarmMonitor } from '@/components/swarm/swarm-monitor';
import { CancelSwarmButton } from './cancel-swarm-button';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SwarmRunPage({
  params,
}: {
  params: Promise<{ slug: string; runId: string }>;
}) {
  const { slug, runId } = await params;

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

  // Fetch swarm run
  const { data: run } = await supabase
    .from('SwarmRun')
    .select('*')
    .eq('id', runId)
    .maybeSingle();

  if (!run || run.spaceId !== space.id) notFound();

  // Fetch members
  const { data: members } = await supabase
    .from('SwarmMember')
    .select('*')
    .eq('swarmRunId', runId)
    .order('wave', { ascending: true });

  const typedRun = run as SwarmRun;
  const typedMembers = (members ?? []) as SwarmMember[];

  const isActive = ['queued', 'planning', 'running', 'auditing'].includes(typedRun.status);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <a
              href={`/s/${slug}/swarm`}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
            >
              ← Swarm
            </a>
          </div>
          <h1 className="text-xl font-semibold line-clamp-2">{typedRun.goal}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Started {formatDate(typedRun.createdAt)}
          </p>
        </div>

        {/* Cancel button — only if status is running/planning/queued/auditing */}
        {isActive && (
          <CancelSwarmButton runId={typedRun.id} slug={slug} />
        )}
      </div>

      {/* Main monitor — handles SSE */}
      <SwarmMonitor
        runId={typedRun.id}
        initialRun={typedRun}
        initialMembers={typedMembers}
        slug={slug}
      />
    </div>
  );
}
