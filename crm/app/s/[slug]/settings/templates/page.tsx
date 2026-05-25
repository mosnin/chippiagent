import { permanentRedirect } from 'next/navigation';

/**
 * Message templates folded into /settings — preserve old bookmarks with a
 * 308 redirect to the inline #templates section.
 */
export default async function TemplatesRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/s/${slug}/settings?tab=apps#api-keys`);
}
