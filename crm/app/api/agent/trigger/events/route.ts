import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { triggerOpsAuthorized, triggerOpsEnabled } from '@/lib/agent/trigger-ops';
import { recordTriggerOpsAudit } from '@/lib/agent/trigger-audit';

import { parseTriggerEventLog, type TriggerStatus } from '@/lib/agent/trigger-events';

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
    return NextResponse.json({ events: [], reason: 'Redis not configured' });
  }

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? '50')));
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0'));
  const statusParam = url.searchParams.get('status');
  const status: TriggerStatus | null = statusParam === 'deduped' || statusParam === 'queued' || statusParam === 'queued_modal' || statusParam === 'replayed'
    ? statusParam
    : null;

  const key = `agent:trigger:events:${space.id}`;
  const end = offset + limit - 1;
  const res = await fetch(`${kvUrl}/lrange/${encodeURIComponent(key)}/${offset}/${end}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${kvToken}` },
  });
  if (!res.ok) {
    return NextResponse.json({ events: [], reason: 'Redis error' }, { status: 502 });
  }

  const body = await res.json() as { result?: string[] };
  const events = (body.result ?? [])
    .map((raw) => parseTriggerEventLog(raw))
    .filter((v): v is NonNullable<typeof v> => Boolean(v))
    .filter((v) => (status ? v.status === status : true));

  return NextResponse.json({ events, count: events.length, offset, limit, status });
}


export async function DELETE(req: Request) {
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
    return NextResponse.json({ cleared: false, reason: 'Redis not configured' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const reason = typeof (body as { reason?: unknown }).reason === 'string'
    ? (body as { reason: string }).reason.trim().slice(0, 240)
    : null;

  const key = `agent:trigger:events:${space.id}`;
  const res = await fetch(`${kvUrl}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}` },
  });

  if (!res.ok) {
    return NextResponse.json({ cleared: false, reason: 'Redis error' }, { status: 502 });
  }

  await recordTriggerOpsAudit({
    kvUrl,
    kvToken,
    spaceId: space.id,
    action: 'clear_events',
    userId,
    detail: reason ? { reason } : undefined,
  });

  return NextResponse.json({ cleared: true });
}

