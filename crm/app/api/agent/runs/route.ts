/**
 * GET /api/agent/runs
 *
 * Returns the most recent run IDs for the space, so the UI can
 * offer to connect to a live or recent stream.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Most recent 5 distinct runIds from the activity log
  const { data } = await supabase
    .from('AgentActivityLog')
    .select('runId, agentType, createdAt')
    .eq('spaceId', space.id)
    .order('createdAt', { ascending: false })
    .limit(20);

  // Deduplicate by runId, keep earliest timestamp per run
  const seen = new Set<string>();
  const runs: { runId: string; agentType: string; startedAt: string }[] = [];
  for (const row of data ?? []) {
    if (!seen.has(row.runId)) {
      seen.add(row.runId);
      runs.push({ runId: row.runId, agentType: row.agentType, startedAt: row.createdAt });
      if (runs.length >= 5) break;
    }
  }

  return NextResponse.json(runs);
}
