/**
 * GET    /api/files/documents/[id]  — document metadata + full content.
 * PUT    /api/files/documents/[id]  — overwrite from { title, content }.
 * DELETE /api/files/documents/[id]  — remove the row + the storage object.
 *
 * Editor documents are `File` rows with `mimeType: text/markdown`; the
 * loadDoc guard scopes every operation to the caller's space AND to that
 * mimeType, so a non-document file id resolves to a 404 here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { uploadObject, deleteObject, getObjectText } from '@/lib/storage';
import { DOC_MIME } from '../route';

export const runtime = 'nodejs';

const MAX_DOC_BYTES = 1_000_000;
const MAX_TITLE_LEN = 200;

function loadDoc(id: string, spaceId: string) {
  return supabase
    .from('File')
    .select('id, spaceId, storageKey, name, createdAt')
    .eq('id', id)
    .eq('spaceId', spaceId)
    .eq('mimeType', DOC_MIME)
    .maybeSingle();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const { data: doc, error } = await loadDoc(id, space.id);
  if (error) {
    logger.error('[files/documents/id] lookup failed', { id }, error);
    return NextResponse.json({ error: 'Failed to load document' }, { status: 500 });
  }
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let content = '';
  try {
    content = await getObjectText(doc.storageKey);
  } catch (err) {
    logger.error('[files/documents/id] content fetch failed', { id }, err as Error);
    return NextResponse.json({ error: 'Failed to load document' }, { status: 500 });
  }

  return NextResponse.json({
    id: doc.id,
    title: doc.name,
    content,
    createdAt: doc.createdAt,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

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

  const { data: doc, error } = await loadDoc(id, space.id);
  if (error) {
    logger.error('[files/documents/id] update lookup failed', { id }, error);
    return NextResponse.json({ error: 'Failed to load document' }, { status: 500 });
  }
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // The storage key never changes after creation — overwrite in place.
  try {
    await uploadObject({
      key: doc.storageKey,
      body: content,
      contentType: DOC_MIME,
      isPublic: false,
    });
  } catch (err) {
    logger.error('[files/documents/id] save failed', { id }, err as Error);
    return NextResponse.json({ error: 'Failed to save document' }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from('File')
    .update({ name: title, sizeBytes: bytes })
    .eq('id', id)
    .eq('spaceId', space.id);

  if (updateError) {
    logger.error('[files/documents/id] row update failed', { id }, updateError);
    return NextResponse.json({ error: 'Failed to save document' }, { status: 500 });
  }

  return NextResponse.json({ id, title, createdAt: doc.createdAt });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const { data: doc, error } = await loadDoc(id, space.id);
  if (error) {
    logger.error('[files/documents/id] delete lookup failed', { id }, error);
    return NextResponse.json({ error: 'Failed to load document' }, { status: 500 });
  }
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error: delError } = await supabase
    .from('File')
    .delete()
    .eq('id', id)
    .eq('spaceId', space.id);

  if (delError) {
    logger.error('[files/documents/id] delete failed', { id }, delError);
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
  }

  // Best-effort object cleanup — a few leaked bytes beat a dangling row.
  await deleteObject(doc.storageKey).catch((err) => {
    logger.warn('[files/documents/id] storage cleanup failed', { id, key: doc.storageKey }, err);
  });

  return NextResponse.json({ ok: true });
}
