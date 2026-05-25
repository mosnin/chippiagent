import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

async function resolve(userId: string, propertyId: string) {
  const space = await getSpaceForUser(userId);
  if (!space) return null;
  const { data: property } = await supabase
    .from('Property')
    .select('id')
    .eq('id', propertyId)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (!property) return null;
  return space;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const space = await resolve(userId, id);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('PropertyPacket')
    .select('*')
    .eq('propertyId', id)
    .eq('spaceId', space.id)
    .order('createdAt', { ascending: false });

  if (error) {
    logger.error('[packets/GET]', { propertyId: id }, error);
    return NextResponse.json({ error: 'Failed to list packets' }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const space = await resolve(userId, id);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  // Default expiry: 7 days. Pass null to make it permanent (not recommended
  // but allowed for internal sharing).
  let expiresAt: string | null = null;
  if (body.expiresAt === null) {
    expiresAt = null;
  } else if (body.expiresAt) {
    const d = new Date(body.expiresAt as string);
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid expiresAt' }, { status: 400 });
    expiresAt = d.toISOString();
  } else {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    expiresAt = d.toISOString();
  }

  // Validate every documentId actually belongs to the caller's space. Otherwise
  // a malicious client could trick the packet page into signing URLs for
  // documents it doesn't own.
  const includeIds = Array.isArray(body.includeDocumentIds)
    ? (body.includeDocumentIds as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 50)
    : [];
  if (includeIds.length > 0) {
    const { data: docs } = await supabase
      .from('DealDocument')
      .select('id')
      .in('id', includeIds)
      .eq('spaceId', space.id);
    const validIds = new Set((docs ?? []).map((r) => r.id as string));
    for (const id of includeIds) {
      if (!validIds.has(id)) {
        return NextResponse.json({ error: 'Unknown document id' }, { status: 400 });
      }
    }
  }

  // Token: 32 bytes URL-safe = 43 chars base64url, plenty of entropy.
  const token = crypto.randomBytes(32).toString('base64url');

  const { data, error } = await supabase
    .from('PropertyPacket')
    .insert({
      id: crypto.randomUUID(),
      spaceId: space.id,
      propertyId: id,
      name,
      token,
      includeDocumentIds: includeIds,
      expiresAt,
    })
    .select()
    .single();

  if (error) {
    logger.error('[packets/POST]', { propertyId: id }, error);
    return NextResponse.json({ error: 'Failed to create packet' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
