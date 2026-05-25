import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { checkRateLimit } from '@/lib/rate-limit';
import { assertSpaceEnabled } from '@/lib/agent/kill-switch';

const ALLOWED_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'] as const;
type AllowedModel = (typeof ALLOWED_MODELS)[number];

// ── GET /api/custom-agents?spaceId=... ───────────────────────────────────────
// List all active custom agents for a space, newest-first.

export async function GET(req: NextRequest) {
  const spaceId = req.nextUrl.searchParams.get('spaceId');
  if (!spaceId) {
    return NextResponse.json({ error: 'spaceId required' }, { status: 400 });
  }

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const rl = await checkRateLimit(`custom-agents:list:${userId}`, 60, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: undefined },
      { status: 429 },
    );
  }

  // Verify the space belongs to the calling user.
  const space = await getSpaceForUser(userId);
  if (!space || space.id !== spaceId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await assertSpaceEnabled(spaceId);
  } catch {
    return NextResponse.json({ error: 'Space is disabled' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('CustomAgent')
    .select('*')
    .eq('spaceId', spaceId)
    .eq('isActive', true)
    .order('createdAt', { ascending: false });

  if (error) {
    console.error('[custom-agents/GET] query error:', error);
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }

  return NextResponse.json({ agents: data ?? [] });
}

// ── POST /api/custom-agents ───────────────────────────────────────────────────
// Create a new custom agent for a space.

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    spaceId,
    name,
    description,
    systemPrompt,
    model,
    capabilities,
  } = body as {
    spaceId?: string;
    name?: string;
    description?: string;
    systemPrompt?: string;
    model?: string;
    capabilities?: unknown;
  };

  if (!spaceId || typeof spaceId !== 'string') {
    return NextResponse.json({ error: 'spaceId required' }, { status: 400 });
  }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  if (name.trim().length > 100) {
    return NextResponse.json({ error: 'name must be 100 characters or fewer' }, { status: 400 });
  }

  if (!systemPrompt || typeof systemPrompt !== 'string' || systemPrompt.trim().length === 0) {
    return NextResponse.json({ error: 'systemPrompt required' }, { status: 400 });
  }
  if (systemPrompt.trim().length > 4000) {
    return NextResponse.json({ error: 'systemPrompt must be 4000 characters or fewer' }, { status: 400 });
  }

  if (model !== undefined && !ALLOWED_MODELS.includes(model as AllowedModel)) {
    return NextResponse.json(
      { error: `model must be one of: ${ALLOWED_MODELS.join(', ')}` },
      { status: 400 },
    );
  }

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const rl = await checkRateLimit(`custom-agents:create:${userId}`, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: undefined },
      { status: 429 },
    );
  }

  // Verify the space belongs to the calling user.
  const space = await getSpaceForUser(userId);
  if (!space || space.id !== spaceId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await assertSpaceEnabled(spaceId);
  } catch {
    return NextResponse.json({ error: 'Space is disabled' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('CustomAgent')
    .insert({
      spaceId,
      name: name.trim(),
      ...(description !== undefined && { description }),
      systemPrompt: systemPrompt.trim(),
      ...(model !== undefined && { model }),
      ...(capabilities !== undefined && { capabilities }),
    })
    .select();

  if (error) {
    console.error('[custom-agents/POST] insert error:', error);
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
  }

  return NextResponse.json({ agent: data[0] }, { status: 201 });
}
