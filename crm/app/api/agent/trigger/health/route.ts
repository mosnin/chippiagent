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
    return NextResponse.json({ health: 'unknown', reason: 'Redis not configured' });
  }

  const key = `agent:trigger:events:${space.id}`;
  const res = await fetch(`${kvUrl}/lrange/${encodeURIComponent(key)}/0/49`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${kvToken}` },
  });
  if (!res.ok) return NextResponse.json({ health: 'unknown', reason: 'Redis error' }, { status: 502 });

  const body = await res.json() as { result?: string[] };
  let total = 0;
  let deduped = 0;
  let queuedModal = 0;

  for (const raw of body.result ?? []) {
    try {
      const row = JSON.parse(raw) as { status?: string };
      total += 1;
      if (row.status === 'deduped') deduped += 1;
      if (row.status === 'queued_modal') queuedModal += 1;
    } catch {
      // ignore malformed rows
    }
  }

  const dedupeRate = total > 0 ? deduped / total : 0;
  const modalRate = total > 0 ? queuedModal / total : 0;
  const health = dedupeRate > 0.6 || modalRate < 0.2 ? 'warn' : 'ok';

  return NextResponse.json({ health, total, dedupeRate, modalRate, windowSize: 50 });
}
