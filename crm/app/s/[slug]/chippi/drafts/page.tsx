/**
 * /chippi/drafts — sent/failed log of outreach Chippi already tried.
 *
 * This is not a review station. Chippi sends on its own. The page shows
 * what landed and what failed. The /chippi/approvals route is a different
 * surface (paused AgentTask runs) and is not this log.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { AgentDraftInbox, DRAFTS_PAGE_COPY } from '@/components/agent/agent-draft-inbox';

export const dynamic = 'force-dynamic';

export default async function ChippiDraftsPage({
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
        <header className="mb-8 sm:mb-10">
          <h1
            className="text-[2rem] sm:text-[2.5rem] tracking-tight leading-tight text-foreground"
            style={{ fontFamily: 'var(--font-title)' }}
          >
            {DRAFTS_PAGE_COPY.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-md">
            {DRAFTS_PAGE_COPY.subtitle}
          </p>
        </header>
        <AgentDraftInbox slug={slug} />
      </div>
    </div>
  );
}
