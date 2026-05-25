/**
 * Files page — generic upload surface for documents, images, PDFs, videos,
 * and audio. Falls back to a graceful empty state when nothing's been
 * uploaded yet. All actual uploading + listing happens client-side via
 * /api/files so the page can be a thin server shell.
 */

import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { FilesPanel } from './files-panel';

export const dynamic = 'force-dynamic';

export default async function FilesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Files</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Drop a file anywhere on this page to upload. Documents, images,
          PDFs, video, audio — all in one place.
        </p>
      </header>
      <FilesPanel />
    </div>
  );
}
