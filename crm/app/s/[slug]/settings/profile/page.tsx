import { permanentRedirect } from 'next/navigation';

/**
 * Profile folded into /settings — preserve old bookmarks with a 308 redirect
 * to the inline #profile section.
 */
export default async function ProfileRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/s/${slug}/settings?tab=profile`);
}
