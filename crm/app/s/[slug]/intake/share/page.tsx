import { redirect } from 'next/navigation';

/**
 * /intake/share was a five-section ceremony page (link + UTM variants + embed
 * iframe + social share buttons). The link itself already lives on the intake
 * overview; everything else was configuration disguised as a feature. Cut.
 *
 * Anyone landing here from a stale link or bookmark gets sent to the place
 * that actually matters.
 */
export default async function IntakeSharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/s/${slug}/intake`);
}
