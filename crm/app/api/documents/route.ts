import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { requireContactAccess } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { uploadObject, deleteObject, buildKey } from '@/lib/storage';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/**
 * POST — Upload a document for a contact.
 *
 * Stores the file in the private `contact-documents` Supabase Storage
 * bucket and records metadata in the ContactDocument table. The
 * `storageKey` column holds the bucket path; the per-id GET endpoint
 * mints short-lived signed URLs for download.
 *
 * Two auth paths:
 * - uploadedBy === 'guest': restricted to public-intake contacts
 *   created in the last 5 minutes (applicant uploading during apply flow).
 * - otherwise: requireContactAccess (authenticated realtor).
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const contactId = formData.get('contactId') as string;
  const file = formData.get('file') as File;
  const uploadedBy = (formData.get('uploadedBy') as string) || 'agent';

  if (!contactId || !file) {
    return NextResponse.json({ error: 'contactId and file required' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'File type not supported' }, { status: 400 });
  }

  // Magic-number check — prevents MIME spoofing. WEBP magic is "WEBP"
  // at bytes 8-11 so we need 12 bytes of header.
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isPdf = header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46; // %PDF
  const isJpeg = header[0] === 0xFF && header[1] === 0xD8;
  const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
  const isWebp = header.length >= 12 && header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50;
  const isDoc = header[0] === 0xD0 && header[1] === 0xCF; // OLE2 (DOC)
  const isDocx = header[0] === 0x50 && header[1] === 0x4B; // ZIP (DOCX)
  if (!isPdf && !isJpeg && !isPng && !isWebp && !isDoc && !isDocx) {
    return NextResponse.json({ error: 'File content does not match declared type' }, { status: 400 });
  }

  // Auth + space resolution. resolvedUploadedBy is derived from the auth
  // path, NOT from the request body, so a caller can't claim 'agent' on
  // a guest-restricted upload.
  let resolvedSpaceId: string;
  let resolvedUploadedBy: string;
  let rateLimitKey: string;
  if (uploadedBy === 'guest') {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: guestContact } = await supabase
      .from('Contact')
      .select('spaceId')
      .eq('id', contactId)
      .contains('tags', ['application-link'])
      .gte('createdAt', fiveMinAgo)
      .maybeSingle();
    if (!guestContact) {
      return NextResponse.json({ error: 'Contact not found or upload window expired' }, { status: 404 });
    }
    resolvedSpaceId = guestContact.spaceId;
    resolvedUploadedBy = 'guest';
    // Guest path: rate-limit per contactId since there's no userId.
    rateLimitKey = `doc-upload:guest:${contactId}`;
  } else {
    const auth = await requireContactAccess(contactId);
    if (auth instanceof NextResponse) return auth;

    const { data: authedContact } = await supabase
      .from('Contact')
      .select('spaceId')
      .eq('id', contactId)
      .single();
    if (!authedContact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }
    resolvedSpaceId = authedContact.spaceId;
    resolvedUploadedBy = 'agent';
    rateLimitKey = `doc-upload:${auth.userId}`;
  }

  // Rate-limit AFTER auth so we don't burn the limit on unauthorized requests.
  const { allowed } = await checkRateLimit(rateLimitKey, 20, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many uploads' }, { status: 429 });
  }

  // Storage path: contact-documents/spaceId/contactId/<uuid>-<safeName>.
  // The contactDocuments prefix groups the file with its peers; spaceId
  // scoping makes "purge on space deletion" a single key-prefix delete.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const storagePath = buildKey(
    'contactDocuments',
    resolvedSpaceId,
    contactId,
    `${crypto.randomUUID()}-${safeName}`,
  );

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    await uploadObject({
      key: storagePath,
      body: buffer,
      contentType: file.type,
      // Private — served only via signed URLs from /api/documents/[id].
      isPublic: false,
    });
  } catch (uploadError) {
    logger.error('[documents] upload failed', { contactId }, uploadError as Error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  const { data: doc, error } = await supabase
    .from('ContactDocument')
    .insert({
      contactId,
      spaceId: resolvedSpaceId,
      fileName: file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255),
      fileType: file.type,
      fileSize: file.size,
      storageKey: storagePath,
      uploadedBy: resolvedUploadedBy,
    })
    .select('id, fileName, fileType, fileSize, createdAt')
    .single();

  if (error) {
    // Best-effort rollback so we don't leak storage objects on failed inserts.
    await deleteObject(storagePath).catch(() => undefined);
    logger.error('[documents] insert failed', { contactId }, error);
    return NextResponse.json({ error: 'Failed to save document' }, { status: 500 });
  }

  return NextResponse.json(doc, { status: 201 });
}

/**
 * GET — List documents for a contact (metadata only). For an individual
 * file URL or content, use GET /api/documents/[id].
 */
export async function GET(req: NextRequest) {
  const contactId = req.nextUrl.searchParams.get('contactId');
  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 });

  const auth = await requireContactAccess(contactId);
  if (auth instanceof NextResponse) return auth;

  const { data: docs } = await supabase
    .from('ContactDocument')
    .select('id, fileName, fileType, fileSize, uploadedBy, createdAt')
    .eq('contactId', contactId)
    .order('createdAt', { ascending: false });

  return NextResponse.json(docs ?? []);
}
