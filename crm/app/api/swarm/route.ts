/**
 * POST /api/swarm  — create a SwarmRun and fire-and-forget to the Modal swarm runner
 * GET  /api/swarm?spaceId=... — list the last 20 swarm runs for a space
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { assertSpaceEnabled } from '@/lib/agent/kill-switch';
import { checkRateLimit } from '@/lib/rate-limit';

// ── GET /api/swarm?spaceId=... ───────────────────────────────────────────────
// List recent swarm runs for a space, newest-first, capped at 20.

export async function GET(req: NextRequest) {
  const spaceId = req.nextUrl.searchParams.get('spaceId');
  if (!spaceId) {
    return NextResponse.json({ error: 'spaceId required' }, { status: 400 });
  }

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const rl = await checkRateLimit(`swarm:list:${userId}`, 60, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
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
    .from('SwarmRun')
    .select('*')
    .eq('spaceId', spaceId)
    .order('createdAt', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[swarm/GET] query error:', error);
    return NextResponse.json({ error: 'Failed to fetch swarm runs' }, { status: 500 });
  }

  return NextResponse.json({ runs: data ?? [] });
}

// ── POST /api/swarm ───────────────────────────────────────────────────────────
// Create a SwarmRun row (status: 'queued') and trigger the Modal swarm runner.

interface PostBody {
  spaceId?: string;
  goal?: string;
  customAgentIds?: string[];
}

interface CustomAgentRow {
  id: string;
  name: string;
  systemPrompt: string;
}

export async function POST(req: NextRequest) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const spaceId = typeof body.spaceId === 'string' ? body.spaceId.trim() : '';
  const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
  const customAgentIds = Array.isArray(body.customAgentIds) ? body.customAgentIds : [];

  if (!spaceId) {
    return NextResponse.json({ error: 'spaceId required' }, { status: 400 });
  }
  if (!goal) {
    return NextResponse.json({ error: 'goal required' }, { status: 400 });
  }
  if (goal.length > 2000) {
    return NextResponse.json({ error: 'goal must be 2000 characters or fewer' }, { status: 400 });
  }

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const rl = await checkRateLimit(`swarm:create:${userId}`, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
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

  // Fetch custom agents if IDs were provided.
  let agents: CustomAgentRow[] = [];
  if (customAgentIds.length > 0) {
    const { data: agentRows, error: agentError } = await supabase
      .from('CustomAgent')
      .select('id, name, systemPrompt')
      .in('id', customAgentIds)
      .eq('spaceId', space.id)
      .eq('isActive', true);

    if (agentError) {
      console.error('[swarm/POST] custom agent fetch error:', agentError);
      return NextResponse.json({ error: 'Failed to fetch custom agents' }, { status: 500 });
    }

    agents = (agentRows ?? []) as CustomAgentRow[];
  }

  // Insert the SwarmRun row.
  const { data: run, error: insertError } = await supabase
    .from('SwarmRun')
    .insert({ spaceId: space.id, goal, status: 'queued' })
    .select()
    .single();

  if (insertError || !run) {
    console.error('[swarm/POST] insert error:', insertError);
    return NextResponse.json({ error: 'Failed to create swarm run' }, { status: 500 });
  }

  // Fire-and-forget to Modal swarm runner.
  const swarmUrl = process.env.MODAL_SWARM_URL;
  if (swarmUrl) {
    fetch(swarmUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret: process.env.AGENT_INTERNAL_SECRET,
        swarmRunId: run.id,
        goal,
        spaceId: space.id,
        customAgents: agents.map((a) => ({
          id: a.id,
          name: a.name,
          systemPrompt: a.systemPrompt,
        })),
      }),
    }).catch((err) => console.error('[swarm] trigger failed', err));
    // Do NOT await — fire and forget
  }

  return NextResponse.json({ swarmRunId: run.id }, { status: 201 });
}
