import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import type { MessageChannel } from '@/lib/message-templates';

const VALID_CHANNELS: MessageChannel[] = ['sms', 'email', 'note'];

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('MessageTemplate')
    .select('*')
    .eq('spaceId', space.id)
    .order('updatedAt', { ascending: false });

  if (error) {
    logger.error('[templates] list failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Failed to list templates' }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  const channel = typeof body.channel === 'string' ? body.channel : '';
  const content = typeof body.body === 'string' ? body.body.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 200) : null;

  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
  if (!VALID_CHANNELS.includes(channel as MessageChannel)) {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });
  }
  if (!content) return NextResponse.json({ error: 'Body required' }, { status: 400 });
  if (content.length > 5000) {
    return NextResponse.json({ error: 'Body must be under 5000 characters' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('MessageTemplate')
    .insert({
      id: crypto.randomUUID(),
      spaceId: space.id,
      name,
      channel,
      body: content,
      subject: channel === 'email' && subject ? subject : null,
    })
    .select()
    .single();

  if (error) {
    logger.error('[templates] create failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
