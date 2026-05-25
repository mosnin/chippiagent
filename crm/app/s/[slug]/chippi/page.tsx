import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ChippiWorkspace } from '@/components/chippi/chippi-workspace';
import type { Conversation } from '@/lib/types';
import type { MessageBlock } from '@/lib/ai-tools/blocks';
import { composioConfigured } from '@/lib/integrations/composio';
import { loadUserInvocableSkills } from '@/lib/ai-tools/skills/loader';

// Force dynamic rendering — the page reads searchParams to pick which
// conversation to hydrate, and we need a fresh server render on every
// query-string change. Without this, Next.js can serve a cached render
// across navigations and the workspace ends up with stale initialMessages.
export const dynamic = 'force-dynamic';

export default async function ChippiPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; tab?: string; prefill?: string; conversationId?: string }>;
}) {
  const { slug } = await params;
  const { q, tab, prefill, conversationId: urlConversationId } = await searchParams;
  const initialInput = typeof q === 'string' && q.trim() ? q.trim() : undefined;
  // `prefill` populates the composer but does NOT auto-send — the realtor
  // finishes the sentence themselves. Used by "or just tell Chippi →" shortcuts
  // on /contacts and /deals (and by morning-actions). Distinct from `q`.
  const initialPrefill = typeof prefill === 'string' && prefill.length > 0 ? prefill : undefined;
  const view = tab === 'settings' ? 'settings' : 'workspace';

  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Verify the authenticated user owns this space
  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  // Load conversations for this space
  let conversations: Conversation[] = [];
  let initialMessages: { role: 'user' | 'assistant'; content: string; blocks?: MessageBlock[] | null }[] = [];
  let initialConversationId: string | null = null;

  try {
    const { data: convData } = await supabase
      .from('Conversation')
      .select('*')
      .eq('spaceId', space.id)
      .not('title', 'like', '[BROKERAGE_CHAT]%')
      .order('updatedAt', { ascending: false })
      .limit(50);
    conversations = (convData ?? []) as Conversation[];

    // Pick which conversation to hydrate. URL is the source of truth.
    // No URL param → show the new-chat screen (targetConvId = null).
    const targetConvId = urlConversationId ?? null;
    if (targetConvId) {
      initialConversationId = targetConvId;
      const { data: msgData } = await supabase
        .from('Message')
        .select('role, content, blocks')
        .eq('conversationId', targetConvId)
        .order('createdAt', { ascending: true })
        .limit(50);
      initialMessages = ((msgData ?? []) as { role: string; content: string; blocks: MessageBlock[] | null }[]).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        blocks: m.blocks,
      }));
    }
  } catch {
    // fall back to empty state
  }

  // Discovery banner: show "Connect Gmail to send your drafts →" under the
  // morning when the realtor has zero active integrations AND Composio is
  // configured. Snapshot at page load — connecting an integration triggers
  // an OAuth navigation that reloads the page, so the banner self-clears.
  let hasIntegrations = false;
  if (composioConfigured()) {
    const { count } = await supabase
      .from('IntegrationConnection')
      .select('id', { count: 'exact', head: true })
      .eq('spaceId', space.id)
      .eq('status', 'active');
    hasIntegrations = (count ?? 0) > 0;
  }
  // If Composio isn't configured at all, treat as "has integrations" so the
  // banner stays hidden — there's nothing to connect to.
  const showConnectBanner = composioConfigured() && !hasIntegrations;

  // The skills offered in the composer's `/` menu — read from the SKILL.md
  // files at request time (cached for the process lifetime).
  const skills = loadUserInvocableSkills();

  return (
    <div className="flex h-full flex-col">
      <ChippiWorkspace
        slug={slug}
        view={view}
        initialMessages={initialMessages}
        initialConversations={conversations}
        initialConversationId={initialConversationId}
        initialInput={initialInput}
        initialPrefill={initialPrefill}
        showConnectBanner={showConnectBanner}
        skills={skills}
      />
    </div>
  );
}
