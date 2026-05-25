import { redirect } from 'next/navigation';

/**
 * /intake/analytics was a stat strip + a list of submissions. The overview
 * already shows the stats and the latest five; the full list is one click
 * away in /contacts (filtered to application-link submissions). Two surfaces
 * for the same data is the failure to decide.
 */
export default async function IntakeAnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/s/${slug}/intake`);
}
