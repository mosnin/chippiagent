/**
 * Routines — the realtor's standing instructions for Chippi.
 *
 * Server shell only — resolves the space, then hands off to the client
 * <RoutinesManager/>, which reads and writes through /api/routines. The
 * hourly cron at /api/cron/routines is what actually fires them.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { RoutinesManager } from '@/components/routines/routines-manager';
import { H1, TITLE_FONT, BODY_MUTED, SECTION_RHYTHM, READING_MAX } from '@/lib/typography';

export default async function RoutinesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  return (
    <div className={`${SECTION_RHYTHM} ${READING_MAX}`}>
      <header className="space-y-1.5">
        <p className={BODY_MUTED}>Routines.</p>
        <h1 className={H1} style={TITLE_FONT}>
          What Chippi does on its own
        </h1>
        <p className={BODY_MUTED}>
          Standing instructions Chippi runs on a schedule — even when you&apos;re
          not here. Every run drafts; nothing is sent without your approval.
        </p>
      </header>

      <RoutinesManager />
    </div>
  );
}
