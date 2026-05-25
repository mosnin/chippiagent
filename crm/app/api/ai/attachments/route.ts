/**
 * POST /api/ai/attachments — chat attachment upload.
 * DELETE /api/ai/attachments?id=... — remove a chat attachment.
 *
 * The realtor drops a file into the prompt box; the client posts it here, we
 * stash it in Supabase Storage, persist a row in `Attachment`, and hand the id
 * back. /api/ai/task hydrates the row and forwards it to the sandbox runner so
 * the cowork agent can read it via the `read_attachment` tool.
 *
 * Bucket access model: the `chat-attachments` bucket is PUBLIC, matching the
 * branding bucket. Access control is the unguessable storagePath
 * (`<spaceId>/<uuid>-<filename>`) — this is the same trade-off /api/upload
 * already makes for branding assets, and avoids the operational cost of
 * minting signed URLs for every agent tool call.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import crypto from 'crypto';
import { uploadObject, deleteObject, getPublicUrl, buildKey } from '@/lib/storage';

export const runtime = 'nodejs';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_FILENAME_LEN = 200;

const ALLOWED_MIME = new Set<string>([
  // images
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  // docs
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // text
  'text/plain',
  'text/csv',
  'application/json',
  'text/markdown',
]);

/**
 * Strip path separators, control chars, and trim length so storagePath stays
 * inside `<spaceId>/<id>-<filename>`. Falls back to "file" if everything is
 * stripped (rare, but defensive against `..` / control-only inputs).
 */
function sanitizeFilename(raw: string): string {
  const cleaned = raw
    .replace(/[\\/]/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\.\.+/g, '.')
    .trim();
  const trimmed = cleaned.slice(0, MAX_FILENAME_LEN);
  return trimmed || 'file';
}

/**
 * Quick magic-byte check on the declared mime type. Doesn't cover every type
 * (text/plain has no magic) — so we only enforce the check for binary formats
 * where a mismatch implies a disguised upload. Returns null on success or an
 * error string on mismatch.
 */
function validateMagicBytes(mime: string, buf: Buffer): string | null {
  const has = (offset: number, bytes: number[]) =>
    buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

  switch (mime) {
    case 'image/png':
      return has(0, [0x89, 0x50, 0x4e, 0x47]) ? null : 'png signature mismatch';
    case 'image/jpeg':
      return has(0, [0xff, 0xd8, 0xff]) ? null : 'jpeg signature mismatch';
    case 'image/webp':
      return has(0, [0x52, 0x49, 0x46, 0x46]) && has(8, [0x57, 0x45, 0x42, 0x50])
        ? null
        : 'webp signature mismatch';
    case 'image/gif':
      return has(0, [0x47, 0x49, 0x46, 0x38]) ? null : 'gif signature mismatch';
    case 'application/pdf':
      return has(0, [0x25, 0x50, 0x44, 0x46]) ? null : 'pdf signature mismatch';
    // DOCX and XLSX are zip containers — both start with PK\x03\x04
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return has(0, [0x50, 0x4b, 0x03, 0x04]) ? null : 'office signature mismatch';
    default:
      // text/* and application/json have no reliable magic — skip
      return null;
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { allowed } = await checkRateLimit(`ai:attachments:${userId}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many uploads' }, { status: 429 });
  }

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  const conversationIdRaw = formData.get('conversationId');
  const conversationId =
    typeof conversationIdRaw === 'string' && conversationIdRaw.trim()
      ? conversationIdRaw.trim()
      : null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (file.size <= 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${Math.floor(MAX_BYTES / 1024 / 1024)} MB limit` },
      { status: 413 },
    );
  }

  const mimeType = (file.type || '').toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${mimeType || 'unknown'}` },
      { status: 415 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const magicErr = validateMagicBytes(mimeType, buffer);
  if (magicErr) {
    return NextResponse.json(
      { error: `File content does not match declared type (${magicErr})` },
      { status: 400 },
    );
  }

  const id = crypto.randomUUID();
  const sanitized = sanitizeFilename(file.name || 'file');
  const storagePath = buildKey('chatAttachments', space.id, `${id}-${sanitized}`);

  try {
    await uploadObject({
      key: storagePath,
      body: buffer,
      contentType: mimeType,
      isPublic: true,
    });
  } catch (uploadError) {
    logger.error('[ai/attachments] storage upload failed', { spaceId: space.id }, uploadError as Error);
    return NextResponse.json(
      { error: uploadError instanceof Error ? uploadError.message : 'Upload failed' },
      { status: 500 },
    );
  }

  const publicUrl = getPublicUrl(storagePath);

  const isImage = mimeType.startsWith('image/');
  // Images go straight to the model via vision — no extraction needed. Anything
  // else gets extracted on demand by the read_attachment tool inside the sandbox.
  const extractionStatus = isImage ? 'skipped' : 'pending';

  const { error: insertError } = await supabase.from('Attachment').insert({
    id,
    spaceId: space.id,
    userId,
    conversationId,
    filename: sanitized,
    mimeType,
    sizeBytes: file.size,
    storagePath,
    publicUrl,
    extractionStatus,
  });
  if (insertError) {
    // Best-effort cleanup so we don't orphan the storage object.
    await deleteObject(storagePath).catch(() => {});
    logger.error('[ai/attachments] insert failed', { spaceId: space.id }, insertError);
    return NextResponse.json(
      { error: insertError.message || 'Could not save attachment' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    id,
    filename: sanitized,
    mimeType,
    sizeBytes: file.size,
    publicUrl,
    isImage,
    extractionStatus,
  });
}

export async function DELETE(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data, error } = await supabase
    .from('Attachment')
    .select('id, spaceId, storagePath')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logger.error('[ai/attachments] lookup failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (data.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Delete the storage object first; if the row delete fails afterwards the
  // worst case is an orphaned DB row pointing at a missing object — survivable.
  await deleteObject(data.storagePath).catch((err) => {
    logger.warn('[ai/attachments] storage remove failed', { spaceId: space.id }, err);
  });

  const { error: delError } = await supabase.from('Attachment').delete().eq('id', id);
  if (delError) {
    logger.error('[ai/attachments] delete failed', { spaceId: space.id }, delError);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
