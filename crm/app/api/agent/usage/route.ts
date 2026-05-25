/**
 * GET /api/agent/usage
 *
 * Returns today's token usage for the space from Upstash Redis.
 * Used by the settings panel to show the realtor how much of their
 * daily budget has been consumed.
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  let used = 0;

  if (kvUrl && kvToken) {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const key = `agent:budget:${space.id}:${date}`;
    try {
      const res = await fetch(`${kvUrl}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${kvToken}` },
      });
      if (res.ok) {
        const { result } = await res.json() as { result: string | null };
        used = result ? parseInt(result, 10) : 0;
      }
    } catch {
      // Redis unavailable — return 0
    }
  }

  // Also grab the configured daily limit from AgentSettings
  const { data: agentSettings } = await supabase
    .from('AgentSettings')
    .select('dailyTokenBudget')
    .eq('spaceId', space.id)
    .maybeSingle();

  const limit = (agentSettings?.dailyTokenBudget as number | null) ?? 50_000;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  // Reset time: midnight UTC today
  const now = new Date();
  const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

  return NextResponse.json({ used, limit, pct, resetsAt });
}
