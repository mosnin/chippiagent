import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getSignedDownloadUrl } from '@/lib/storage';

/**
 * Public signed-URL endpoint for documents inside a packet. No auth — gated
 * entirely by the packet token + expiry + the document being explicitly
 * included in the packet's includeDocumentIds array.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; docId: string }> },
) {
  const { token, docId } = await params;

  const { data: packet } = await supabase
    .from('PropertyPacket')
    .select('includeDocumentIds, spaceId, expiresAt, revokedAt')
    .eq('token', token)
    .maybeSingle();

  if (!packet) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (packet.revokedAt) return NextResponse.json({ error: 'Link revoked' }, { status: 410 });
  if (packet.expiresAt && new Date(packet.expiresAt) < new Date()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 });
  }

  const includes = (packet.includeDocumentIds ?? []) as string[];
  if (!includes.includes(docId)) {
    return NextResponse.json({ error: 'Document not in packet' }, { status: 403 });
  }

  const { data: doc } = await supabase
    .from('DealDocument')
    .select('storagePath, spaceId')
    .eq('id', docId)
    .eq('spaceId', packet.spaceId)
    .maybeSingle();

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  let signedUrl: string;
  try {
    signedUrl = await getSignedDownloadUrl(doc.storagePath, 60 * 5);
  } catch (error) {
    logger.error('[packet/docs] signed URL failed', { token, docId }, error as Error);
    return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 });
  }

  return NextResponse.json({ url: signedUrl });
}
