/**
 * GET  /api/files/documents  — list the space's editor-authored documents.
 * POST /api/files/documents  — create one from { title, content }.
 *
 * A "document" is a file the realtor writes in-app rather than uploads. It
 * lives in the same `File` table and the same Wasabi store as every other
 * file; the only thing that marks it as editable is `mimeType: text/markdown`.
 * No separate table — a document is just a file you authored here.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { uploadObject, deleteObject, buildKey } from '@/lib/storage';

export const runtime = 'nodejs';

/** The mimeType that marks a File row as an in-app editor document. */
export const DOC_MIME = 'text/markdown';
/** 1 MB of text is already an absurdly long document. */
const MAX_DOC_BYTES = 1_000_000;
const MAX_TITLE_LEN = 200;

/** Slugify a title into a safe storage-key segment. */
function slugForKey(title: string): string {
  return title.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'document';
}

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('File')
    .select('id, name, sizeBytes, createdAt')
    .eq('spaceId', space.id)
    .eq('mimeType', DOC_MIME)
    .order('createdAt', { ascending: false })
    .limit(500);

  if (error) {
    logger.error('[files/documents] list failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Failed to list documents' }, { status: 500 });
  }

  return NextResponse.json({
    documents: (data ?? []).map((d) => ({
      id: d.id,
      title: d.name,
      sizeBytes: Number(d.sizeBytes ?? 0),
      createdAt: d.createdAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { title?: unknown; content?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const content = typeof body.content === 'string' ? body.content : '';
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  if (title.length > MAX_TITLE_LEN) {
    return NextResponse.json({ error: 'Title is too long' }, { status: 400 });
  }
  const bytes = Buffer.byteLength(content, 'utf-8');
  if (bytes > MAX_DOC_BYTES) {
    return NextResponse.json({ error: 'Document is too large' }, { status: 413 });
  }

  const id = crypto.randomUUID();
  const storageKey = buildKey('files', space.id, `${id}-${slugForKey(title)}.md`);

  try {
    await uploadObject({
      key: storageKey,
      body: content,
      contentType: DOC_MIME,
      isPublic: false,
    });
  } catch (err) {
    logger.error('[files/documents] upload failed', { spaceId: space.id }, err as Error);
    return NextResponse.json({ error: 'Failed to save document' }, { status: 500 });
  }

  const { data: inserted, error } = await supabase
    .from('File')
    .insert({
      id,
      spaceId: space.id,
      userId,
      storageKey,
      name: title,
      mimeType: DOC_MIME,
      category: 'document',
      sizeBytes: bytes,
      isPublic: false,
    })
    .select('id, name, sizeBytes, createdAt')
    .single();

  if (error || !inserted) {
    // Best-effort rollback so a failed insert doesn't leak a storage object.
    await deleteObject(storageKey).catch(() => undefined);
    logger.error('[files/documents] insert failed', { spaceId: space.id }, error ?? undefined);
    return NextResponse.json({ error: 'Failed to save document' }, { status: 500 });
  }

  return NextResponse.json(
    {
      id: inserted.id,
      title: inserted.name,
      sizeBytes: Number(inserted.sizeBytes ?? 0),
      createdAt: inserted.createdAt,
    },
    { status: 201 },
  );
}
