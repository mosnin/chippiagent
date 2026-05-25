import { permanentRedirect } from 'next/navigation';

/**
 * Legal settings folded into General — preserve old bookmarks with
 * a 308 redirect to the relevant section anchor.
 */
export default async function LegalRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/s/${slug}/settings?tab=workspace#legal`);
}
