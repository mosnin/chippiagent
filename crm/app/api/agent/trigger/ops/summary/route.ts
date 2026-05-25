import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { triggerOpsAuthorized, triggerOpsEnabled } from '@/lib/agent/trigger-ops';

export async function GET(req: Request) {
  if (!triggerOpsEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!triggerOpsAuthorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) {
    return NextResponse.json({ total: 0, byAction: { clear_events: 0, replay_event: 0 }, reason: 'Redis not configured' });
  }

  const url = new URL(req.url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? '200')));

  const key = `agent:trigger:ops:${space.id}`;
  const res = await fetch(`${kvUrl}/lrange/${encodeURIComponent(key)}/0/${limit - 1}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${kvToken}` },
  });
  if (!res.ok) {
    return NextResponse.json({ total: 0, byAction: { clear_events: 0, replay_event: 0 }, reason: 'Redis error' }, { status: 502 });
  }

  const body = await res.json() as { result?: string[] };
  const byAction = { clear_events: 0, replay_event: 0 };
  let total = 0;

  for (const raw of body.result ?? []) {
    try {
      const row = JSON.parse(raw) as { action?: string };
      if (!row.action) continue;
      total += 1;
      if (row.action === 'clear_events') byAction.clear_events += 1;
      if (row.action === 'replay_event') byAction.replay_event += 1;
    } catch {
      // ignore malformed rows
    }
  }

  return NextResponse.json({ total, byAction, windowSize: limit });
}
