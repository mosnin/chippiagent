/**
 * /s/[slug]/integrations — the connected-apps page.
 *
 * The realtor opens this from the sidebar (or from a chat banner that
 * says "Connect Gmail to send drafts →"). One page, one job: see every
 * app Chippi can connect to, with status and a connect/disconnect verb
 * inline. No tabs, no wizards, no settings.
 *
 * The realtor's lens — what does Chippi DO once I connect Gmail? — is
 * answered by the app's blurb in the row, not by a help article. If the
 * blurb doesn't sell it, fix the blurb.
 *
 * Health status: ConnectedAppsSection fetches /api/integrations/health
 * client-side (non-blocking, refreshes on window focus) and shows a
 * colored dot + label next to each connected app:
 *   - green  "Connected"        — Composio reports ACTIVE
 *   - yellow "Auth expired"     — Composio reports EXPIRED; realtor must reconnect
 *   - red    "Connection error" — Composio reports FAILED or a fetch error
 *   - gray   "Not connected"    — no connection in our DB or Composio
 * This surfaces broken auth before Chippi tries to use the integration,
 * eliminating silent task failures.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import type { Metadata } from 'next';
import { H1, TITLE_FONT, BODY_MUTED, PAGE_RHYTHM } from '@/lib/typography';
import { ConnectedAppsSection } from '@/components/settings/connected-apps-section';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Integrations — ${slug}` };
}

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Verify the authenticated user owns this space — same gate as the
  // other realtor pages.
  const { data: spaceOwner } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .eq('id', space.ownerId)
    .maybeSingle();
  if (!spaceOwner) notFound();

  return (
    <div className={PAGE_RHYTHM}>
      <header className="space-y-1.5">
        <p className={BODY_MUTED}>Integrations.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Connected apps
        </h1>
        <p className={BODY_MUTED}>
          Connect Chippi to the apps you already use. Drafts go where you send mail. Tours land on your calendar. Chippi never sends without your tap.
        </p>
      </header>

      <ConnectedAppsSection />
    </div>
  );
}
