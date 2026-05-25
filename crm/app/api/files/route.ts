/**
 * GET  /api/files               — list files in current space.
 * POST /api/files                — upload a file.
 *
 * Per-file: validates mime + magic bytes + category size cap.
 * Per-space: enforces the plan-tier total storage quota.
 * Per-user: 50 uploads / hour rate limit.
 *
 * Files are stored privately. The Files page fetches per-file signed URLs
 * lazily via /api/files/[id] when the user clicks Download.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { uploadObject, deleteObject, buildKey, getPublicUrl } from '@/lib/storage';
import {
  validateUpload,
  quotaForPlan,
  formatBytes,
  MIME_RULES,
} from '@/lib/storage/limits';

export const runtime = 'nodejs';

/** Strip path separators + control chars + trim length. Falls back to
 *  "file" if everything is stripped. */
function sanitizeFilename(raw: string): string {
  const cleaned = raw
    .replace(/[\\/]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/\.\.+/g, '.')
    .trim();
  return cleaned.slice(0, 200) || 'file';
}

/** Map a chat Attachment row's mimeType to the File-shape category. The
 *  Attachment table doesn't carry a category column (chat attachments
 *  were never bucketed) so we derive it from the mime prefix. */
function deriveCategory(mimeType: string): 'image' | 'document' | 'video' | 'audio' | 'other' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (
    mimeType === 'application/pdf' ||
    mimeType.startsWith('application/vnd.openxmlformats-officedocument') ||
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType.startsWith('text/')
  ) {
    return 'document';
  }
  return 'other';
}

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const category = req.nextUrl.searchParams.get('category');

  // Query both surfaces in parallel — File (Files page uploads) AND
  // Attachment (chat uploads). The Files page renders the union so the
  // realtor sees every file in one place. Each row carries `source` so
  // the UI can show a small "From chat" badge and the delete path can
  // route to the right endpoint.
  const [fileRes, attachmentRes] = await Promise.all([
    (() => {
      let q = supabase
        .from('File')
        .select('id, name, mimeType, category, sizeBytes, isPublic, createdAt')
        .eq('spaceId', space.id)
        .order('createdAt', { ascending: false })
        .limit(500);
      if (category) q = q.eq('category', category);
      return q;
    })(),
    supabase
      .from('Attachment')
      .select('id, filename, mimeType, sizeBytes, createdAt')
      .eq('spaceId', space.id)
      .order('createdAt', { ascending: false })
      .limit(500),
  ]);

  if (fileRes.error) {
    logger.error('[files] list failed', { spaceId: space.id }, fileRes.error);
    return NextResponse.json({ error: 'Failed to list files' }, { status: 500 });
  }

  type ListedFile = {
    id: string;
    name: string;
    mimeType: string;
    category: string;
    sizeBytes: number;
    isPublic: boolean;
    createdAt: string;
    source: 'file' | 'chat';
  };

  const fileRows: ListedFile[] = (fileRes.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    mimeType: r.mimeType,
    category: r.category,
    sizeBytes: Number(r.sizeBytes ?? 0),
    isPublic: Boolean(r.isPublic),
    createdAt: r.createdAt,
    source: 'file',
  }));

  // Chat attachments are public-served (the chat-attachments/ prefix is
  // covered by the bucket policy) and always have a mime — categorize on
  // the fly. Apply the same category filter the File query used.
  const chatRows: ListedFile[] = ((attachmentRes.data ?? []) as Array<{
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number | null;
    createdAt: string;
  }>)
    .map((r) => ({
      id: r.id,
      name: r.filename,
      mimeType: r.mimeType,
      category: deriveCategory(r.mimeType),
      sizeBytes: Number(r.sizeBytes ?? 0),
      isPublic: true,
      createdAt: r.createdAt,
      source: 'chat' as const,
    }))
    .filter((r) => !category || r.category === category);

  const merged = [...fileRows, ...chatRows].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );

  // Quota gauge counts File-table bytes only — chat attachments don't
  // count against the realtor's storage quota (they're conversation
  // ephemera with their own retention).
  const usedBytes = fileRows.reduce((sum, r) => sum + r.sizeBytes, 0);

  // Plan tier may not exist yet in main — graceful default to 'free' until
  // the Plan migration lands. Cast through unknown for the optional column.
  const planId = ((space as unknown) as { planId?: string }).planId ?? 'free';
  const quota = quotaForPlan(planId);

  return NextResponse.json({
    files: merged,
    quota: {
      planId,
      totalBytes: quota.totalBytes,
      usedBytes,
      remainingBytes: Math.max(quota.totalBytes - usedBytes, 0),
      label: quota.label,
    },
  });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { allowed } = await checkRateLimit(`files:upload:${userId}`, 50, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many uploads. Try again in an hour.' }, { status: 429 });
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
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Pull the first 16 bytes for the magic-byte check before reading the
  // whole file into memory. Keeps the validator honest on huge uploads
  // that we'd reject anyway.
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const validation = validateUpload({
    mimeType: file.type,
    sizeBytes: file.size,
    header,
  });
  if (!validation.ok) {
    const status = validation.reason?.startsWith('Unsupported') ? 415 : 400;
    return NextResponse.json({ error: validation.reason }, { status });
  }
  const category = validation.category!;

  // Quota check — sum existing rows + new size against the plan limit.
  const planId = ((space as unknown) as { planId?: string }).planId ?? 'free';
  const quota = quotaForPlan(planId);
  const { data: existing } = await supabase
    .from('File')
    .select('sizeBytes')
    .eq('spaceId', space.id);
  const usedBytes = (existing ?? []).reduce(
    (sum, r) => sum + Number(r.sizeBytes ?? 0),
    0,
  );
  if (usedBytes + file.size > quota.totalBytes) {
    const remaining = Math.max(quota.totalBytes - usedBytes, 0);
    return NextResponse.json(
      {
        error: `Storage quota exceeded. Your plan allows ${quota.label}; ${formatBytes(remaining)} remaining.`,
        quota: { totalBytes: quota.totalBytes, usedBytes, remainingBytes: remaining },
      },
      { status: 413 },
    );
  }

  const id = crypto.randomUUID();
  const sanitized = sanitizeFilename(file.name || `file.${MIME_RULES[file.type]?.extension ?? 'bin'}`);
  const storageKey = buildKey('files', space.id, `${id}-${sanitized}`);

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    await uploadObject({
      key: storageKey,
      body: buffer,
      contentType: file.type,
      isPublic: false,
    });
  } catch (err) {
    logger.error('[files] upload failed', { spaceId: space.id }, err as Error);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from('File')
    .insert({
      id,
      spaceId: space.id,
      userId,
      storageKey,
      name: sanitized,
      mimeType: file.type,
      category,
      sizeBytes: file.size,
      isPublic: false,
    })
    .select('id, name, mimeType, category, sizeBytes, isPublic, createdAt')
    .single();

  if (insertError) {
    // Best-effort rollback so we don't leak storage objects.
    await deleteObject(storageKey).catch(() => undefined);
    logger.error('[files] insert failed', { spaceId: space.id }, insertError);
    return NextResponse.json({ error: 'Failed to record file' }, { status: 500 });
  }

  return NextResponse.json(inserted, { status: 201 });
}
