import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

// ── GET /api/swarm/[runId] ────────────────────────────────────────────────────
// Fetch a swarm run and its member list.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { runId } = await params;

  const space = await getSpaceForUser(userId);
  if (!space) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch the run and verify it belongs to the calling user's space.
  const { data: run, error: runError } = await supabase
    .from('SwarmRun')
    .select('*')
    .eq('id', runId)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (runError) {
    console.error('[swarm/[runId]/GET] run fetch error:', runError);
    return NextResponse.json({ error: 'Failed to fetch run' }, { status: 500 });
  }
  if (!run) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Fetch all members for this run.
  const { data: members, error: membersError } = await supabase
    .from('SwarmMember')
    .select('*')
    .eq('swarmRunId', runId);

  if (membersError) {
    console.error('[swarm/[runId]/GET] members fetch error:', membersError);
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
  }

  return NextResponse.json({ run, members: members ?? [] });
}
