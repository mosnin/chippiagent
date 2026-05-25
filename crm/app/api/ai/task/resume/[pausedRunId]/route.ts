/**
 * POST /api/ai/task/resume/[pausedRunId]
 *
 * Resume a chat turn that paused on a tool approval. The new SDK-based
 * runtime persists every paused run as one row in `AgentPausedRun`. This
 * endpoint loads that row, applies the realtor's approve/deny decision,
 * and streams the continuation as SSE — same wire format as the fresh
 * turn at /api/ai/task.
 *
 * Contract is intentionally narrow:
 *   - One POST, opaque pausedRunId in the path
 *   - Body: { approved: boolean, message?: string, callId?: string }
 *     - `callId` is optional. If omitted, we apply the decision to the
 *       first pending approval on the run — which covers the common
 *       single-pending case. With multiple pending approvals, the UI
 *       must pass the callId from the AgentPausedRun.approvals[i].
 *     - `message` is the rejection reason that flows back to the model.
 *   - Response: text/event-stream of AgentEvents (same as /api/ai/task)
 *
 * Why a separate endpoint instead of reusing /api/agent/drafts/[id]:
 * paused runs are different objects with a different lifecycle from
 * AgentDrafts. AgentDrafts are autonomous-run send-or-store; paused runs
 * are interactive checkpoints. Conflating the two endpoints would force
 * the UI to discriminate on every action — cleaner to give the chat
 * agent its own resume verb.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { chippiErrorMessage } from '@/lib/ai-tools/chippi-voice';
import type { ToolContext } from '@/lib/ai-tools/types';
import { streamTsResumeTurn } from '@/lib/ai-tools/sdk-chat-stream';
import { chatRuntime } from '@/lib/ai-tools/runtime-flag';

interface PostBody {
  approved: boolean;
  message?: string;
  callId?: string;
}

interface PausedRunRow {
  id: string;
  spaceId: string;
  userId: string;
  conversationId: string | null;
  runState: string;
  approvals: Array<{ callId: string; toolName: string; arguments: unknown; summary: string }>;
  status: 'pending' | 'resumed' | 'cancelled' | 'expired';
  expiresAt: string | null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pausedRunId: string }> },
) {
  // Guardrail: this endpoint only makes sense when the TS runtime is on.
  // If someone hits it on a default-modal deploy we 404 — keeps the
  // contract honest with the flag.
  if (chatRuntime() !== 'ts') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { pausedRunId } = await params;
  if (!pausedRunId || typeof pausedRunId !== 'string') {
    return NextResponse.json({ error: 'pausedRunId required' }, { status: 400 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body.approved !== 'boolean') {
    return NextResponse.json({ error: 'approved (boolean) required' }, { status: 400 });
  }

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  // Per-user rate limit. Approvals are cheap so we allow plenty of them.
  const { allowed } = await checkRateLimit(`ai:task:resume:${auth.userId}`, 60, 3600);
  if (!allowed) {
    return NextResponse.json({ error: chippiErrorMessage('rate_limited') }, { status: 429 });
  }

  // Load + scope check. The userId stored on the row is the Clerk userId.
  const { data: row, error } = await supabase
    .from('AgentPausedRun')
    .select('id, spaceId, userId, conversationId, runState, approvals, status, expiresAt')
    .eq('id', pausedRunId)
    .maybeSingle();
  if (error) {
    logger.error('[ai/task resume] load failed', { pausedRunId }, error);
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const paused = row as PausedRunRow;
  if (paused.userId !== auth.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (paused.status !== 'pending') {
    return NextResponse.json({ error: `Run is ${paused.status}` }, { status: 409 });
  }
  if (paused.expiresAt && new Date(paused.expiresAt).getTime() < Date.now()) {
    // Best-effort flip; ignore failures — the request is over either way.
    await supabase.from('AgentPausedRun').update({ status: 'expired' }).eq('id', paused.id);
    return NextResponse.json({ error: 'Run expired' }, { status: 410 });
  }

  // Resolve the space row from the stored spaceId. We don't reuse
  // resolveToolContext here because that helper takes a slug — the paused
  // run carries the spaceId directly, which is more precise (the slug
  // could have changed between pause and resume).
  const { data: space } = await supabase
    .from('Space')
    .select('id, slug, name, ownerId')
    .eq('id', paused.spaceId)
    .maybeSingle();
  if (!space) {
    return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  }

  const abortController = new AbortController();
  const ctx: ToolContext = {
    userId: auth.userId,
    space: { id: space.id, slug: space.slug, name: space.name, ownerId: space.ownerId },
    signal: abortController.signal,
  };

  // Pick which approval the decision applies to. The body can name a
  // specific callId; otherwise we use the first pending approval — which
  // is correct in the common single-pending case.
  const callId = body.callId ?? paused.approvals[0]?.callId;
  if (!callId) {
    return NextResponse.json({ error: 'No pending approvals on this run' }, { status: 400 });
  }

  // Mark the row resumed before we kick off the stream. If the model's
  // continuation lands a NEW pause, the stream pump will write a NEW
  // AgentPausedRun row — we don't reuse the old one because the run state
  // has advanced past it.
  // Compare-and-swap: only the request that flips pending→resumed proceeds.
  // Without the status filter two concurrent resumes both passed the
  // `status !== 'pending'` check above and both ran the approved tool.
  const { data: marked, error: markErr } = await supabase
    .from('AgentPausedRun')
    .update({ status: 'resumed', updatedAt: new Date().toISOString() })
    .eq('id', paused.id)
    .eq('status', 'pending')
    .select('id');
  if (markErr) {
    logger.error('[ai/task resume] status update failed', { pausedRunId }, markErr);
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 500 });
  }
  if (!marked || marked.length === 0) {
    return NextResponse.json({ error: 'Run is already resumed' }, { status: 409 });
  }

  return streamTsResumeTurn({
    ctx,
    conversationId: paused.conversationId ?? '',
    serializedState: paused.runState,
    callId,
    decision: body.approved
      ? { approved: true }
      : { approved: false, message: body.message },
    abortController,
  });
}
