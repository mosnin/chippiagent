import { redirect } from 'next/navigation';

/**
 * The workspace home is /chippi — the agent surface IS the dashboard.
 * The old tile-grid + mission-control view was the v1 home; everything it
 * showed has been folded into the dispatch console on /chippi (the
 * "What I did / Drafts / Questions / Who to reach today / What's coming"
 * sections). Sending users there directly is the canonical Phase 2 home.
 *
 * The layout (app/s/[slug]/layout.tsx) handles auth, space ownership, and
 * the subscription gate before this page renders, so the redirect runs
 * only for legitimately-scoped requests.
 */
export default async function SpaceHomeRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/s/${slug}/chippi`);
}
