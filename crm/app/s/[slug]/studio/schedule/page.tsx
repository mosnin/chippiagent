import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { SchedulePanel } from './schedule-panel';
import { H1, TITLE_FONT, BODY_MUTED, PAGE_RHYTHM } from '@/lib/typography';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function StudioSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ fileId?: string }>;
}) {
  const { slug } = await params;
  const { fileId } = await searchParams;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  return (
    <div className={cn('mx-auto max-w-5xl px-6 py-8', PAGE_RHYTHM)}>
      <header className="space-y-1.5">
        <p className={BODY_MUTED}>Studio.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Schedule
        </h1>
        <p className={BODY_MUTED}>
          Queue a post to the social accounts you have connected.
        </p>
      </header>
      <SchedulePanel
        slug={slug}
        initialFileId={typeof fileId === 'string' ? fileId : null}
      />
    </div>
  );
}
