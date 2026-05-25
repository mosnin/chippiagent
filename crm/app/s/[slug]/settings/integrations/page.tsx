import { permanentRedirect } from 'next/navigation';

/**
 * Integrations folded into /settings — preserve old bookmarks with a 308
 * redirect to the inline #integrations section.
 */
export default async function IntegrationsRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/s/${slug}/settings?tab=apps`);
}
