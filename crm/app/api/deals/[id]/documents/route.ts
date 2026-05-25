import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { isValidDocumentKind } from '@/lib/deals/documents';
import { uploadObject, deleteObject, buildKey } from '@/lib/storage';

export const runtime = 'nodejs';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — closing disclosures with embedded exhibits can be large.

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

async function resolveDealAndSpace(userId: string, dealId: string) {
  const space = await getSpaceForUser(userId);
  if (!space) return null;
  const { data: deal } = await supabase
    .from('Deal')
    .select('id')
    .eq('id', dealId)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (!deal) return null;
  return space;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const space = await resolveDealAndSpace(userId, id);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('DealDocument')
    .select('*')
    .eq('dealId', id)
    .order('createdAt', { ascending: false });

  if (error) {
    logger.error('[deals/docs] list failed', { dealId: id }, error);
    return NextResponse.json({ error: 'Failed to list documents' }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // Uploads are I/O-heavy and user-uploaded — rate limit at the user level.
  const { allowed } = await checkRateLimit(`deal-doc-upload:${userId}`, 10, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many uploads' }, { status: 429 });

  const { id } = await params;
  const space = await resolveDealAndSpace(userId, id);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  const kind = formData.get('kind');
  const labelRaw = formData.get('label');

  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!isValidDocumentKind(kind)) return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File must be under 25MB' }, { status: 413 });
  if (file.size === 0) return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type. Allowed: PDF, image, Word.' }, { status: 400 });
  }

  const label = typeof labelRaw === 'string' && labelRaw.trim()
    ? labelRaw.trim().slice(0, 200)
    : file.name.slice(0, 200);

  // Storage path: deal-documents/spaceId/dealId/<uuid>-<safeName>. The
  // dealDocuments prefix groups files with their peers; spaceId scoping
  // makes "purge on space deletion" a single key-prefix delete.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const storagePath = buildKey(
    'dealDocuments',
    space.id,
    id,
    `${crypto.randomUUID()}-${safeName}`,
  );

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    await uploadObject({
      key: storagePath,
      body: buffer,
      contentType: file.type,
      isPublic: false,
    });
  } catch (uploadError) {
    logger.error('[deals/docs] upload failed', { dealId: id }, uploadError as Error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  const { data: inserted, error: insertError } = await supabase
    .from('DealDocument')
    .insert({
      id: crypto.randomUUID(),
      dealId: id,
      spaceId: space.id,
      kind,
      label,
      storagePath,
      contentType: file.type,
      sizeBytes: file.size,
      uploadedById: userId,
    })
    .select()
    .single();

  if (insertError) {
    // Best-effort rollback — delete the uploaded object so we don't leak it.
    await deleteObject(storagePath).catch(() => undefined);
    logger.error('[deals/docs] insert failed', { dealId: id }, insertError);
    return NextResponse.json({ error: 'Failed to record document' }, { status: 500 });
  }

  return NextResponse.json(inserted, { status: 201 });
}
