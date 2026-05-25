/**
 * /chippi/memory — what Chippi has learned about this workspace.
 *
 * Reads AgentMemory rows for the space, grouped by entity. Replaces the old
 * redirect-to-settings stub now that the page is surfaced in the Chippi nav
 * dropdown — a dead link in the IA was worse than building the page.
 *
 * Editing isn't supported in v1 (vector embeddings would silently desync);
 * the correction pattern is "delete the wrong fact and let Chippi re-learn it."
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { MemoryList } from '@/components/chippi/memory-list';

export const dynamic = 'force-dynamic';

export default async function ChippiMemoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full max-w-3xl mx-auto chat-content-wrap pt-10 sm:pt-14 pb-24">
        <header className="mb-8">
          <h1
            className="text-2xl sm:text-3xl tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-title)' }}
          >
            What I remember
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Facts, preferences, and observations I&apos;ve picked up while working with you.
            Delete anything you want me to forget.
          </p>
        </header>
        <MemoryList />
      </div>
    </div>
  );
}
