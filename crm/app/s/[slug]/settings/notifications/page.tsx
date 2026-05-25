import { permanentRedirect } from 'next/navigation';

/**
 * Notifications settings folded into General — preserve old bookmarks
 * with a 308 redirect to the relevant section anchor.
 */
export default async function NotificationsRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/s/${slug}/settings?tab=notifications`);
}
