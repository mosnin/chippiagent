/**
 * /apply/[slug]/chat — collapsed into /apply/[slug].
 *
 * Old surface: a free-text-only chat that lived alongside the multi-step
 * form. New surface: the chat is the only intake, and it lives at
 * /apply/[slug]. This route stays as a permanent redirect so any links
 * the realtor or their leads have bookmarked / pasted still resolve.
 */

import { redirect, permanentRedirect } from 'next/navigation';

export default async function PublicApplyChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/apply/${slug}`);
  // Unreachable — appease TS narrowing.
  redirect(`/apply/${slug}`);
}
