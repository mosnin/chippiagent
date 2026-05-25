import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

async function resolve(userId: string, propertyId: string, packetId: string) {
  const space = await getSpaceForUser(userId);
  if (!space) return null;
  const { data } = await supabase
    .from('PropertyPacket')
    .select('*')
    .eq('id', packetId)
    .eq('propertyId', propertyId)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (!data) return null;
  return { space, packet: data };
}

/** Revoke or update a packet. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; packetId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id, packetId } = await params;
  const ctx = await resolve(userId, id, packetId);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.revoked === true) patch.revokedAt = new Date().toISOString();
  if (body.revoked === false) patch.revokedAt = null;

  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 200);
    if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    patch.name = name;
  }

  if (body.expiresAt !== undefined) {
    if (body.expiresAt === null) patch.expiresAt = null;
    else {
      const d = new Date(body.expiresAt as string);
      if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid expiresAt' }, { status: 400 });
      patch.expiresAt = d.toISOString();
    }
  }

  if (Object.keys(patch).length === 0) return NextResponse.json(ctx.packet);

  const { data, error } = await supabase
    .from('PropertyPacket')
    .update(patch)
    .eq('id', packetId)
    .eq('spaceId', ctx.space.id)
    .select()
    .single();

  if (error) {
    logger.error('[packets/PATCH]', { packetId }, error);
    return NextResponse.json({ error: 'Failed to update packet' }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; packetId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id, packetId } = await params;
  const ctx = await resolve(userId, id, packetId);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await supabase
    .from('PropertyPacket')
    .delete()
    .eq('id', packetId)
    .eq('spaceId', ctx.space.id);
  if (error) {
    logger.error('[packets/DELETE]', { packetId }, error);
    return NextResponse.json({ error: 'Failed to delete packet' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
