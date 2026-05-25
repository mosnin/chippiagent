import { redirect } from 'next/navigation';

/**
 * /intake/tracking was a pixel-configuration page (Meta, Google, etc.). It's
 * a once-per-setup task, not a weekly destination, and pretending it earned
 * its own tab in the intake hub was an admission we didn't know where to put
 * it. Sent back to the overview; if a realtor needs pixels later, that lives
 * in settings.
 */
export default async function IntakeTrackingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/s/${slug}/intake`);
}
