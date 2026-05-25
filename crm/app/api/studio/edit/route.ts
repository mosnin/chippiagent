/**
 * POST /api/studio/edit — transform an uploaded image with fal.ai.
 *
 * The realtor-facing entry point: auth, subscription gate, and rate limiting
 * live here; the upload is stored as a File and the transform runs in the
 * shared core (lib/studio/edit.ts), which the Chippi agent's internal route
 * reuses.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth, requireActiveSubscription } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { uploadObject, deleteObject, buildKey } from '@/lib/storage';
import { validateUpload } from '@/lib/storage/limits';
import { falConfigured } from '@/lib/studio/fal';
import { STUDIO_EDIT_TOOLS } from '@/lib/studio/models';
import { runStudioEdit } from '@/lib/studio/edit';
import { StudioGenerationError } from '@/lib/studio/generate';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const subCheck = await requireActiveSubscription(space, userId);
  if (subCheck) return subCheck;

  if (!falConfigured()) {
    return NextResponse.json(
      { error: 'Image editing is not configured yet.' },
      { status: 503 },
    );
  }

  const { allowed } = await checkRateLimit(`studio:edit:${userId}`, 60, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many edits. Try again in a little while.' },
      { status: 429 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  const toolSlug = String(formData.get('tool') ?? '');
  const promptRaw = formData.get('prompt');
  const prompt = typeof promptRaw === 'string' ? promptRaw : '';

  // Validate the tool slug BEFORE touching storage. The previous order
  // uploaded the source image and inserted a File row, then discovered an
  // unknown slug — an orphan in both storage and the DB on every typo.
  if (!toolSlug || !STUDIO_EDIT_TOOLS[toolSlug]) {
    return NextResponse.json({ error: 'Unknown edit tool.' }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No image provided.' }, { status: 400 });
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const validation = validateUpload({ mimeType: file.type, sizeBytes: file.size, header });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.reason }, { status: 400 });
  }
  if (validation.category !== 'image') {
    return NextResponse.json({ error: 'Only images can be edited.' }, { status: 400 });
  }

  // Store the uploaded image as the source File.
  const sourceBuffer = Buffer.from(await file.arrayBuffer());
  const sourceId = crypto.randomUUID();
  const ext = file.type.includes('png') ? 'png' : file.type.includes('webp') ? 'webp' : 'jpg';
  const sourceName = `source-${sourceId.slice(0, 8)}.${ext}`;
  const sourceKey = buildKey('studio', space.id, `${sourceId}-${sourceName}`);

  try {
    await uploadObject({ key: sourceKey, body: sourceBuffer, contentType: file.type, isPublic: false });
  } catch (err) {
    logger.error('[studio.edit] source upload failed', { spaceId: space.id }, err as Error);
    return NextResponse.json({ error: 'Could not start the edit. Please try again.' }, { status: 500 });
  }

  const { error: srcErr } = await supabase.from('File').insert({
    id: sourceId,
    spaceId: space.id,
    userId,
    storageKey: sourceKey,
    name: sourceName,
    mimeType: file.type,
    category: 'image',
    sizeBytes: sourceBuffer.length,
    isPublic: false,
  });
  if (srcErr) {
    await deleteObject(sourceKey).catch(() => undefined);
    logger.error('[studio.edit] source insert failed', { spaceId: space.id }, srcErr);
    return NextResponse.json({ error: 'Could not start the edit. Please try again.' }, { status: 500 });
  }

  try {
    const result = await runStudioEdit({
      spaceId: space.id,
      userId,
      sourceFileId: sourceId,
      toolSlug,
      prompt,
    });
    return NextResponse.json({ ...result, sourceFileId: sourceId }, { status: 201 });
  } catch (err) {
    if (err instanceof StudioGenerationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'The edit failed. Please try again.' }, { status: 500 });
  }
}
