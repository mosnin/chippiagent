/**
 * /chippi/today — the full-day dashboard.
 *
 * Six surfaces stacked top-to-bottom: morning story (Chippi's voice for
 * the day), drafts summary (linking out to /chippi/drafts), questions,
 * today's focus, what's coming, what Chippi did, active goals. The chat
 * root is the entry; this is where the realtor lands when they want the
 * whole picture.
 *
 * The full AgentDraftInbox UI used to live here, but it dominated the
 * page and duplicated /chippi/drafts. Now /today summarises ("3 drafts
 * waiting → review"); /drafts contains them. Each surface does one thing.
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { MorningStory } from '@/components/chippi/morning-story';
import { AgentQuestionsPanel } from '@/components/agent/agent-questions-panel';
import { AgentGoalsPanel } from '@/components/agent/agent-goals-panel';
import { TodayFocus } from '@/components/chippi/today-focus';
import { WhatsComing } from '@/components/chippi/whats-coming';
import { WhatIDid } from '@/components/chippi/what-i-did';

export const dynamic = 'force-dynamic';

export default async function ChippiTodayPage({
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

  // Pending-drafts count for the compact summary card below MorningStory.
  // head:true skips the row payload — we only need the number.
  const { count: pendingDraftCount } = await supabase
    .from('AgentDraft')
    .select('*', { count: 'exact', head: true })
    .eq('spaceId', space.id)
    .eq('status', 'pending');

  const draftCount = pendingDraftCount ?? 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full max-w-3xl mx-auto chat-content-wrap pt-10 sm:pt-14 pb-24 space-y-8 sm:space-y-10">
        <MorningStory slug={slug} />

        {draftCount > 0 && (
          <Link
            href={`/s/${slug}/chippi/drafts`}
            className="group flex items-center gap-3 pb-3 border-b border-border/60"
          >
            <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
              Drafts
            </h2>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {draftCount}
            </span>
            <span className="text-sm text-foreground">
              waiting for your review
            </span>
            <span className="ml-auto text-xs text-muted-foreground group-hover:text-foreground transition-colors">
              Review →
            </span>
          </Link>
        )}

        <AgentQuestionsPanel />
        <TodayFocus slug={slug} />
        <WhatsComing slug={slug} />
        <WhatIDid slug={slug} />
        <AgentGoalsPanel />
      </div>
    </div>
  );
}
