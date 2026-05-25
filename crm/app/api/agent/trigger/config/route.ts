import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { triggerOpsAuthorized, triggerOpsEnabled } from '@/lib/agent/trigger-ops';
import { parseImmediateEvents } from '@/lib/agent/trigger-policy';

export async function GET(req: Request) {
  if (!triggerOpsEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!triggerOpsAuthorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const immediateEvents = [...parseImmediateEvents(process.env.AGENT_IMMEDIATE_EVENTS)].sort();
  const dedupeWindowSeconds = Math.max(1, Number(process.env.AGENT_TRIGGER_DEDUPE_WINDOW_S ?? '120'));
  const replayRateLimitPerMinute = 20;

  return NextResponse.json({
    spaceId: space.id,
    config: {
      immediateEvents,
      dedupeWindowSeconds,
      replayRateLimitPerMinute,
      hasModalWebhook: Boolean(process.env.MODAL_WEBHOOK_URL),
      hasAgentInternalSecret: Boolean(process.env.AGENT_INTERNAL_SECRET),
      hasRedis: Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
    },
  });
}
