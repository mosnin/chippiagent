import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireContactAccess } from '@/lib/api-auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireContactAccess(id);
  if (auth instanceof NextResponse) return auth;

  const limit = Math.min(Math.max(1, parseInt(_req.nextUrl.searchParams.get('limit') ?? '50') || 50), 200);
  const offset = Math.max(0, parseInt(_req.nextUrl.searchParams.get('offset') ?? '0') || 0);

  const { space } = auth;
  const { data, error } = await supabase
    .from('ContactActivity')
    .select('*')
    .eq('contactId', id)
    .eq('spaceId', space.id)
    .order('createdAt', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    console.error('[activity/GET] query error:', error);
    return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireContactAccess(id);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const body = await req.json();
  const { type, content, metadata } = body;

  const VALID_TYPES = ['note', 'call', 'email', 'meeting', 'follow_up'];
  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid activity type' }, { status: 400 });
  }

  const safeContent = typeof content === 'string' ? content.slice(0, 5000) : null;

  // Validate metadata size to prevent DoS
  if (metadata && JSON.stringify(metadata).length > 10000) {
    return NextResponse.json({ error: 'Metadata too large' }, { status: 413 });
  }

  const { data, error } = await supabase
    .from('ContactActivity')
    .insert({
      id: crypto.randomUUID(),
      contactId: id,
      spaceId: space.id,
      type,
      content: safeContent,
      metadata: metadata ?? null,
    })
    .select()
    .single();
  if (error) {
    console.error('[activity/POST] insert error:', error);
    return NextResponse.json({ error: 'Failed to save activity' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
