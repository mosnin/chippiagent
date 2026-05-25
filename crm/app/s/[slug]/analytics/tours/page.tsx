import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { fetchRawAnalyticsData, buildToursAnalyticsData } from '@/lib/analytics-data';
import { ToursView } from '@/components/analytics/tours-view';
import { H1, TITLE_FONT, BODY_MUTED, PRIMARY_PILL } from '@/lib/typography';

export default async function ToursAnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  try {
    const raw = await fetchRawAnalyticsData(space.id);
    const data = buildToursAnalyticsData(raw);
    return <ToursView data={data} />;
  } catch (err) {
    console.error('[analytics/tours] DB queries failed', err);
    return (
      <div className="rounded-xl border border-border/70 bg-background px-6 py-12 text-center space-y-3">
        <h2 className={H1} style={TITLE_FONT}>
          Something went wrong
        </h2>
        <p className={BODY_MUTED}>
          We couldn&apos;t load your data. This is usually temporary.
        </p>
        <a href={`/s/${slug}/analytics/tours`} className={PRIMARY_PILL}>
          Try again
        </a>
      </div>
    );
  }
}
