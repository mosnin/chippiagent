import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { triggerOpsAuthorized, triggerOpsEnabled } from '@/lib/agent/trigger-ops';

interface OpsAuditRow {
  action: 'clear_events' | 'replay_event';
  userId: string;
  detail: Record<string, unknown> | null;
  at: string;
}

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
    return NextResponse.json({ rows: [], count: 0, reason: 'Redis not configured' });
  }

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? '50')));
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0'));

  const actionParam = url.searchParams.get('action');
  const action = actionParam === 'clear_events' || actionParam === 'replay_event' ? actionParam : null;

  const key = `agent:trigger:ops:${space.id}`;
  const res = await fetch(`${kvUrl}/lrange/${encodeURIComponent(key)}/${offset}/${offset + limit - 1}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${kvToken}` },
  });
  if (!res.ok) {
    return NextResponse.json({ rows: [], count: 0, reason: 'Redis error' }, { status: 502 });
  }

  const body = await res.json() as { result?: string[] };
  const rows: OpsAuditRow[] = (body.result ?? [])
    .map((raw) => {
      try {
        return JSON.parse(raw) as OpsAuditRow;
      } catch {
        return null;
      }
    })
    .filter((v): v is OpsAuditRow => Boolean(v))
    .filter((v) => (action ? v.action === action : true));

  return NextResponse.json({ rows, count: rows.length, offset, limit, action });
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

  const key = `agent:trigger:ops:${space.id}`;
  const res = await fetch(`${kvUrl}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}` },
  });

  if (!res.ok) {
    return NextResponse.json({ cleared: false, reason: 'Redis error' }, { status: 502 });
  }

  return NextResponse.json({ cleared: true });
}
