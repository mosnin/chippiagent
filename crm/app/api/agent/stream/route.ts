/**
 * GET /api/agent/stream?runId=...
 *
 * Server-Sent Events endpoint. The browser subscribes here to receive
 * live task updates from the Modal agent in real-time.
 *
 * Security: spaceId is derived from the authenticated user's session.
 * The Redis key is agent:stream:{spaceId}:{runId} — a user can only
 * ever read keys scoped to their own verified space.
 */

import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Redis } from '@upstash/redis';
import { getSpaceForUser } from '@/lib/space';

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
});

const POLL_INTERVAL_MS = 600;
const MAX_STREAM_DURATION_MS = 5 * 60 * 1000;
// Loose UUID format check — prevents abuse with huge/malformed runIds
const RUN_ID_RE = /^[0-9a-f-]{8,36}$/i;

function eventKey(spaceId: string, runId: string): string {
  return `agent:stream:${spaceId}:${runId}`;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const space = await getSpaceForUser(userId);
  if (!space) {
    return new Response('Forbidden', { status: 403 });
  }

  const runId = req.nextUrl.searchParams.get('runId');
  if (!runId || !RUN_ID_RE.test(runId)) {
    return new Response('Invalid runId', { status: 400 });
  }

  const key = eventKey(space.id, runId);
  const encoder = new TextEncoder();

  let cursor = 0;
  const startedAt = Date.now();
  // Flag set by cancel() when client disconnects so the poll loop exits promptly
  let clientGone = false;

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: string) {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }

      send(JSON.stringify({ type: 'connected', message: 'Connected to agent stream', ts: Date.now() }));

      while (!clientGone) {
        if (Date.now() - startedAt > MAX_STREAM_DURATION_MS) {
          send(JSON.stringify({ type: 'timeout', message: 'Stream timeout', ts: Date.now() }));
          controller.close();
          return;
        }

        try {
          const events = await redis.lrange(key, cursor, -1);

          for (const event of events) {
            if (clientGone) break;
            const str = typeof event === 'string' ? event : JSON.stringify(event);
            send(str);
            cursor++;

            const parsed = typeof event === 'string' ? JSON.parse(event) : event;
            if (parsed.type === 'complete' || parsed.type === 'error') {
              controller.close();
              return;
            }
          }
        } catch {
          // Redis error — keep alive
        }

        controller.enqueue(encoder.encode(': keepalive\n\n'));
        await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
      }

      controller.close();
    },
    cancel() {
      clientGone = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
