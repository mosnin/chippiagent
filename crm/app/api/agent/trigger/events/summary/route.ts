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
    return NextResponse.json({
      total: 0,
      byStatus: { deduped: 0, queued: 0, queued_modal: 0, replayed: 0 },
      rates: { dedupeRate: 0, modalRate: 0 },
      health: 'unknown',
      reason: 'Redis not configured',
    });
  }

  const url = new URL(req.url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? '200')));
  const dedupeWarnThreshold = Math.min(1, Math.max(0, Number(url.searchParams.get('dedupeWarnThreshold') ?? '0.6')));
  const modalWarnThreshold = Math.min(1, Math.max(0, Number(url.searchParams.get('modalWarnThreshold') ?? '0.2')));
  const key = `agent:trigger:events:${space.id}`;

  const res = await fetch(`${kvUrl}/lrange/${encodeURIComponent(key)}/0/${limit - 1}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${kvToken}` },
  });
  if (!res.ok) {
    return NextResponse.json({
      total: 0,
      byStatus: { deduped: 0, queued: 0, queued_modal: 0, replayed: 0 },
      rates: { dedupeRate: 0, modalRate: 0 },
      health: 'unknown',
      reason: 'Redis error',
    }, { status: 502 });
  }

  const body = await res.json() as { result?: string[] };
  const logs = (body.result ?? [])
    .map((raw) => {
      try {
        return JSON.parse(raw) as { status?: string };
      } catch {
        return null;
      }
    })
    .filter((v): v is { status?: string } => Boolean(v));

  const byStatus = { deduped: 0, queued: 0, queued_modal: 0, replayed: 0 };
  for (const row of logs) {
    if (row.status === 'deduped') byStatus.deduped += 1;
    if (row.status === 'queued') byStatus.queued += 1;
    if (row.status === 'queued_modal') byStatus.queued_modal += 1;
    if (row.status === 'replayed') byStatus.replayed += 1;
  }

  const total = logs.length;
  const dedupeRate = total > 0 ? byStatus.deduped / total : 0;
  const modalRate = total > 0 ? byStatus.queued_modal / total : 0;
  const health = dedupeRate > dedupeWarnThreshold || modalRate < modalWarnThreshold ? 'warn' : 'ok';

  return NextResponse.json({
    total,
    byStatus,
    rates: { dedupeRate, modalRate },
    thresholds: { dedupeWarnThreshold, modalWarnThreshold },
    health,
    windowSize: limit,
  });
}
