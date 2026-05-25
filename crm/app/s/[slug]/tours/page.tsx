import { permanentRedirect } from 'next/navigation';

// Tours used to be its own destination. A tour is a calendar event with a
// property + contact attached — Calendar now absorbs the surface. Existing
// links and bookmarks 308 over so nothing breaks.
export default async function ToursRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/s/${slug}/calendar`);
}
