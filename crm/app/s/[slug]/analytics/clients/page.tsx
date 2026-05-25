import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { fetchRawAnalyticsData, buildClientsAnalyticsData } from '@/lib/analytics-data';
import { ClientsView } from '@/components/analytics/clients-view';
import { H1, TITLE_FONT, BODY_MUTED, PRIMARY_PILL } from '@/lib/typography';

export default async function ClientsAnalyticsPage({
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
    const data = buildClientsAnalyticsData(raw);
    return <ClientsView data={data} />;
  } catch (err) {
    console.error('[analytics/clients] DB queries failed', err);
    return (
      <div className="rounded-xl border border-border/70 bg-background px-6 py-12 text-center space-y-3">
        <h2 className={H1} style={TITLE_FONT}>
          Something went wrong
        </h2>
        <p className={BODY_MUTED}>
          We couldn&apos;t load your data. This is usually temporary.
        </p>
        <a href={`/s/${slug}/analytics/clients`} className={PRIMARY_PILL}>
          Try again
        </a>
      </div>
    );
  }
}
