/**
 * Documents page — the realtor's own documents: things they write or paste
 * in-app, as opposed to files they upload. Thin server shell; the editor and
 * list live client-side in DocumentsPanel against /api/files/documents.
 */

import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { DocumentsPanel } from './documents-panel';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 pb-12">
      <header className="space-y-1.5">
        <p className="text-sm text-muted-foreground">Documents.</p>
        <h1
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          Your documents
        </h1>
        <p className="text-sm text-muted-foreground">
          Write or paste documents and keep them in one place.
        </p>
      </header>
      <div className="mt-8">
        <DocumentsPanel />
      </div>
    </div>
  );
}
