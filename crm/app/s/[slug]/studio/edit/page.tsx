import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { EditPanel } from './edit-panel';
import { H1, TITLE_FONT, BODY_MUTED, PAGE_RHYTHM } from '@/lib/typography';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function StudioEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  return (
    <div className={cn('mx-auto max-w-5xl px-6 py-8', PAGE_RHYTHM)}>
      <header className="space-y-1.5">
        <p className={BODY_MUTED}>Studio.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Edit
        </h1>
        <p className={BODY_MUTED}>
          Upscale, clean up backgrounds, and restyle any image.
        </p>
      </header>
      <EditPanel />
    </div>
  );
}
