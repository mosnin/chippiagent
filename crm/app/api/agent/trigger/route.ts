/**
 * POST /api/agent/trigger
 *
 * Public endpoint for the UI to fire an agent trigger. Auth + space resolution
 * happen here; the actual rate-limit / dedupe / Redis push / Modal fire logic
 * lives in lib/agent/fire-trigger so server-side mutation routes (contacts,
 * deals, tours) can fire triggers without going through this REST entrypoint.
 *
 * Secured with Clerk auth. Rate-limited to 20 triggers per space per minute
 * inside the helper.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { isTriggerEvent, type TriggerEvent } from '@/lib/agent/trigger-policy';
import { fireAgentTrigger } from '@/lib/agent/fire-trigger';

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { event, contactId, dealId } = body as {
    event: TriggerEvent;
    contactId?: string;
    dealId?: string;
  };

  if (!event || !isTriggerEvent(event)) {
    return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
  }

  const result = await fireAgentTrigger({ spaceId: space.id, event, contactId, dealId });

  if (!result.queued) {
    if (result.reason === 'rate_limited') {
      return NextResponse.json({ error: 'Too many triggers — slow down' }, { status: 429 });
    }
    if (result.reason === 'redis_not_configured') {
      return NextResponse.json({ queued: false, reason: 'Redis not configured' });
    }
    return NextResponse.json({ queued: false, reason: result.reason ?? 'unknown' });
  }

  return NextResponse.json({
    queued: true,
    deduped: result.deduped ?? false,
    event,
    spaceId: space.id,
    firedImmediately: result.firedImmediately ?? false,
    method: result.firedImmediately ? 'redis+modal' : 'redis',
  });
}
