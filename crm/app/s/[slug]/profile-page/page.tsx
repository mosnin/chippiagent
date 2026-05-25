/**
 * Editor for the realtor's public "link in bio" page.
 *
 * Server shell only — resolves the space, then hands off to the client
 * <ProfileEditor/>, which reads and writes config through
 * /api/profile-page. The public page itself lives at /p/[slug].
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { ProfileEditor } from '@/components/profile-page/profile-editor';
import { H1, TITLE_FONT, BODY_MUTED, SECTION_RHYTHM, READING_MAX } from '@/lib/typography';

export default async function ProfilePageEditor({
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
        <p className={BODY_MUTED}>Profile.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Your public page
        </h1>
        <p className={BODY_MUTED}>
          The one link you share — application, tours, listings, and more.
        </p>
      </header>

      <ProfileEditor slug={slug} />
    </div>
  );
}
