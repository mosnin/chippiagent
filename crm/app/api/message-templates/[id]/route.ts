import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import type { MessageChannel } from '@/lib/message-templates';

const VALID_CHANNELS: MessageChannel[] = ['sms', 'email', 'note'];

async function resolve(userId: string, id: string) {
  const space = await getSpaceForUser(userId);
  if (!space) return null;
  const { data } = await supabase
    .from('MessageTemplate')
    .select('*')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (!data) return null;
  return { space, template: data };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const ctx = await resolve(userId, id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 120);
    if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    patch.name = name;
  }
  if (body.channel !== undefined) {
    if (!VALID_CHANNELS.includes(body.channel as MessageChannel)) {
      return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });
    }
    patch.channel = body.channel;
  }
  if (body.subject !== undefined) {
    patch.subject = body.subject ? String(body.subject).trim().slice(0, 200) : null;
  }
  if (body.body !== undefined) {
    const content = String(body.body).trim();
    if (!content) return NextResponse.json({ error: 'Body cannot be empty' }, { status: 400 });
    if (content.length > 5000) return NextResponse.json({ error: 'Body must be under 5000 characters' }, { status: 400 });
    patch.body = content;
  }

  const { data, error } = await supabase
    .from('MessageTemplate')
    .update(patch)
    .eq('id', id)
    .eq('spaceId', ctx.space.id)
    .select()
    .single();

  if (error) {
    logger.error('[templates] patch failed', { templateId: id }, error);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const ctx = await resolve(userId, id);
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await supabase
    .from('MessageTemplate')
    .delete()
    .eq('id', id)
    .eq('spaceId', ctx.space.id);

  if (error) {
    logger.error('[templates] delete failed', { templateId: id }, error);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
