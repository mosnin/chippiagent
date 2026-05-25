import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { checkRateLimit } from '@/lib/rate-limit';
import crypto from 'crypto';

// GET /api/mcp-keys?slug=xxx — list all MCP API keys for the user's space
export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('McpApiKey')
    .select('id, name, keyPrefix, lastUsedAt, createdAt')
    .eq('spaceId', space.id)
    .order('createdAt', { ascending: false });

  if (error)
    return NextResponse.json({ error: 'Failed to load API keys' }, { status: 500 });
  return NextResponse.json({ keys: data ?? [] });
}

// POST /api/mcp-keys — generate a new MCP API key (returns the full key ONCE)
export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  // Rate limit: max 10 key generations per hour
  const { allowed } = await checkRateLimit(`mcp:keygen:${userId}`, 10, 3600);
  if (!allowed) return NextResponse.json({ error: 'Too many key generations. Try again later.' }, { status: 429 });

  // Limit total keys per space to 20
  const { count } = await supabase.from('McpApiKey').select('*', { count: 'exact', head: true }).eq('spaceId', space.id);
  if ((count ?? 0) >= 20) return NextResponse.json({ error: 'Maximum 20 API keys per workspace' }, { status: 400 });

  let name = 'Default';
  try {
    const body = await req.json();
    if (body.name && typeof body.name === 'string') {
      name = body.name.replace(/[<>"]/g, '').slice(0, 100);
    }
  } catch {
    // body may be empty — that's fine, use default name
  }

  // Generate API key (for direct Bearer auth)
  const rawKey = `chippi_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 12) + '...';

  // Generate OAuth client credentials (for Claude MCP connector)
  const clientId = `chippi_${crypto.randomBytes(16).toString('hex')}`;
  const clientSecret = `cs_${crypto.randomBytes(32).toString('hex')}`;
  const clientSecretHash = crypto.createHash('sha256').update(clientSecret).digest('hex');

  const { data, error } = await supabase
    .from('McpApiKey')
    .insert({
      spaceId: space.id,
      name,
      keyHash,
      keyPrefix,
      clientId,
      clientSecretHash,
    })
    .select('id, name, keyPrefix, createdAt, clientId')
    .single();

  if (error)
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });

  return NextResponse.json({
    ...data,
    key: rawKey,
    clientId,
    clientSecret,
    tokenUrl: 'https://my.usechippi.com/api/mcp/oauth/token',
    mcpUrl: 'https://my.usechippi.com/api/mcp',
  }, { status: 201 });
}

// DELETE /api/mcp-keys — revoke an API key by id (called from settings form)
export async function DELETE(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  try {
    const { id } = await req.json();
    if (!id || typeof id !== 'string') return NextResponse.json({ error: 'id required' }, { status: 400 });

    // Verify key belongs to this space
    const { data: existing } = await supabase
      .from('McpApiKey')
      .select('id')
      .eq('id', id)
      .eq('spaceId', space.id)
      .maybeSingle();

    if (!existing) return NextResponse.json({ error: 'API key not found' }, { status: 404 });

    const { error } = await supabase.from('McpApiKey').delete().eq('id', id);
    if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
