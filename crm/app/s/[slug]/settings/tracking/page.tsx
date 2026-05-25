import { redirect } from 'next/navigation';

/**
 * Backwards-compatibility redirect: tracking settings have moved
 * from Settings > Tracking to the top-level Intake Form section.
 */
export default async function TrackingSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/s/${slug}/intake/tracking`);
}
