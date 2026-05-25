/**
 * GET    /api/files/[id]  — short-lived signed URL for download.
 * DELETE /api/files/[id]  — remove object + row.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getSignedDownloadUrl, deleteObject } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const { data: row, error } = await supabase
    .from('File')
    .select('id, spaceId, storageKey, name, mimeType')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (error) {
    logger.error('[files/id] lookup failed', { id }, error);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let url: string;
  try {
    url = await getSignedDownloadUrl(row.storageKey, 60 * 5); // 5 min
  } catch (err) {
    logger.error('[files/id] signed URL failed', { id }, err as Error);
    return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 });
  }

  return NextResponse.json({ url, name: row.name, mimeType: row.mimeType });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const { data: row, error } = await supabase
    .from('File')
    .select('id, spaceId, storageKey')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (error) {
    logger.error('[files/id] delete lookup failed', { id }, error);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error: delError } = await supabase
    .from('File')
    .delete()
    .eq('id', id)
    .eq('spaceId', space.id);

  if (delError) {
    logger.error('[files/id] delete failed', { id }, delError);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }

  // Best-effort object cleanup — leaked bytes are preferable to a dangling
  // row in the UI.
  await deleteObject(row.storageKey).catch((err) => {
    logger.warn('[files/id] storage cleanup failed', { id, key: row.storageKey }, err);
  });

  return NextResponse.json({ ok: true });
}
