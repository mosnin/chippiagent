/**
 * POST /api/ai/task — on-demand agent streaming endpoint.
 *
 * Every chat turn proxies to the Modal Python sandbox running Chippi via the
 * OpenAI Agents SDK. Modal provides the secure isolated execution environment
 * for long-running, autonomous, multi-step reasoning chains. The Next.js layer
 * handles auth, rate-limiting, persistence, and SSE translation; Modal handles
 * the actual agent loop.
 *
 * Pipeline:
 *   1. Auth the caller + resolve a ToolContext.
 *   2. Rate-limit (per-user, per-IP, per-space).
 *   3. Resolve/create the conversation; save the user message.
 *   4. Load recent history (capped at HISTORY_LIMIT).
 *   5. Hydrate any referenced Attachment rows.
 *   6. POST to Modal chat_turn endpoint with the full context.
 *   7. Translate Modal SSE events → standard agent event format.
 *   8. Persist the assistant message on turn completion.
 *
 * Set CHIPPI_CHAT_RUNTIME=ts to fall back to the in-process TypeScript runtime
 * (useful for local dev without a Modal deployment).
 */

import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { saveUserMessage, saveAssistantMessage } from '@/lib/ai-tools/persistence';
import { resolveToolContext } from '@/lib/ai-tools/context';
import type { ToolContext } from '@/lib/ai-tools/types';
import {
  chippiErrorMessage,
  computeConversationTitle,
  fallbackHeuristic,
} from '@/lib/ai-tools/chippi-voice';
import {
  emit as emitTelemetry,
  hasEmitted as hasEmittedTelemetry,
  getFirstEmittedAt,
  secondsBetween,
} from '@/lib/telemetry';
import { chatRuntime } from '@/lib/ai-tools/runtime-flag';
import { streamTsChatTurn } from '@/lib/ai-tools/sdk-chat-stream';
import { sanitizeUserInput } from '@/lib/agent/prompt-sanitizer';
import type { MessageBlock } from '@/lib/ai-tools/blocks';

// A Modal chat turn can run for minutes (multi-tool agentic reasoning). The
// proxy must outlive the Modal function (its timeout is 600s) or Vercel kills
// the stream mid-turn and the assistant message is lost. nodejs runtime is
// required — this route streams and uses Node `crypto`.
export const runtime = 'nodejs';
export const maxDuration = 300;

interface HistoryRow {
  role: 'user' | 'assistant';
  content: string;
}

interface AttachmentPayload {
  id: string;
  filename: string;
  mime_type: string;
  extracted_text: string | null;
  public_url: string;
}

/** Cap on history messages fed to the model. */
const HISTORY_LIMIT = 20;

interface PostBody {
  spaceSlug: string;
  conversationId?: string | null;
  message: string;
  attachmentIds?: string[];
}

function autoTitleConversation(spaceId: string, conversationId: string, userMessage: string): void {
  void (async () => {
    try {
      const { allowed } = await checkRateLimit(`chat:title:${spaceId}`, 60, 3600);
      const title = allowed
        ? await computeConversationTitle(userMessage)
        : fallbackHeuristic(userMessage);
      if (!title || title === 'New conversation') return;
      const { error } = await supabase
        .from('Conversation')
        .update({ title, updatedAt: new Date().toISOString() })
        .eq('id', conversationId);
      if (error) {
        logger.warn('[ai/task] auto-title patch failed', { conversationId }, error);
      }
    } catch (err) {
      logger.warn('[ai/task] auto-title pipeline crashed', { conversationId }, err);
    }
  })();
}

async function resolveConversation(
  spaceId: string,
  conversationId: string | null | undefined,
  userMessage: string,
): Promise<string> {
  if (conversationId) {
    const { data } = await supabase
      .from('Conversation')
      .select('id, spaceId, title')
      .eq('id', conversationId)
      .maybeSingle();
    if (data && data.spaceId === spaceId) {
      if (!data.title || data.title === 'New conversation') {
        autoTitleConversation(spaceId, conversationId, userMessage);
      }
      return conversationId;
    }
  }

  const id = crypto.randomUUID();
  const { error } = await supabase.from('Conversation').insert({
    id,
    spaceId,
    title: 'New conversation',
  });
  if (error) throw error;
  autoTitleConversation(spaceId, id, userMessage);
  return id;
}

async function loadHistory(spaceId: string, conversationId: string): Promise<HistoryRow[]> {
  const { data } = await supabase
    .from('Message')
    .select('role, content, createdAt')
    .eq('spaceId', spaceId)
    .eq('conversationId', conversationId)
    .order('createdAt', { ascending: false })
    .limit(HISTORY_LIMIT);

  // ascending:false + limit fetches the most RECENT n; reverse to restore
  // chronological order. The old ascending:true + limit silently fed the
  // model the OLDEST n messages and dropped every recent turn once a
  // conversation passed n messages.
  const rows = ((data ?? []) as Array<{ role: string; content: string }>).reverse();
  return rows
    .filter((r) => r.role === 'user' || r.role === 'assistant')
    .map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));
}

async function hydrateAttachments(
  spaceId: string,
  ids: string[] | undefined,
): Promise<AttachmentPayload[]> {
  if (!ids || ids.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from('Attachment')
      .select('id, filename, "mimeType", "extractedText", "publicUrl", "extractionStatus"')
      .in('id', ids)
      .eq('spaceId', spaceId);
    if (error) {
      logger.warn('[ai/task] attachment hydrate failed — continuing empty', { spaceId }, error);
      return [];
    }
    const rows = (data ?? []) as Array<{
      id: string;
      filename: string;
      mimeType: string;
      extractedText: string | null;
      publicUrl: string;
      extractionStatus: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      mime_type: r.mimeType,
      extracted_text: r.extractedText,
      public_url: r.publicUrl,
    }));
  } catch (err) {
    logger.warn('[ai/task] attachment hydrate threw — continuing empty', { spaceId }, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Modal SSE proxy
// ---------------------------------------------------------------------------

interface ProxyModalStreamInput {
  modalBody: ReadableStream<Uint8Array>;
  spaceId: string;
  conversationId: string;
  abortController: AbortController;
}

/**
 * Translate the SSE stream from Modal's chat_turn endpoint into the standard
 * agent event format the browser client expects, persisting the assistant
 * message once the turn completes.
 *
 * Modal event → browser event mapping:
 *   token            → text_delta
 *   tool_call_start  → tool_call_start  (rename "tool" field → "name")
 *   tool_call_result → tool_call_result (rename "tool" field → "name")
 *   done             → turn_complete    (+ persist assistant message)
 *   error            → error
 */
function proxyModalStream({
  modalBody,
  spaceId,
  conversationId,
  abortController,
}: ProxyModalStreamInput): Response {
  const encoder = new TextEncoder();
  let seq = 0;

  function push(controller: ReadableStreamDefaultController, event: Record<string, unknown>) {
    const line = `data: ${JSON.stringify({ seq: seq++, ts: new Date().toISOString(), ...event })}\n\n`;
    controller.enqueue(encoder.encode(line));
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = modalBody.getReader();
      const decoder = new TextDecoder();
      let lineBuf = '';
      const textChunks: string[] = [];
      // Ordered render list assembled as the turn streams — text + tool-call
      // blocks. Persisted verbatim so a reloaded conversation shows what
      // Chippi actually did (tool calls, plan cards), not just a flat reply.
      const blocks: MessageBlock[] = [];
      // Track args from the most recent create_plan tool_call_start so we can
      // emit plan_created when the matching tool_call_result arrives.
      let pendingPlanArgs: Record<string, unknown> | null = null;
      // Persist exactly once — on `done`, on `error`, or on the stream simply
      // dropping. Before this only the `done` path saved, so any mid-stream
      // Modal failure erased the whole assistant turn from history.
      let persisted = false;
      async function persistOnce(finalText?: string): Promise<void> {
        if (persisted) return;
        persisted = true;
        let toSave: MessageBlock[] = blocks;
        if (toSave.length === 0 && finalText && finalText.trim()) {
          toSave = [{ type: 'text', content: finalText }];
        }
        if (toSave.length === 0) return;
        try {
          await saveAssistantMessage({ spaceId, conversationId, blocks: toSave });
        } catch (err) {
          logger.warn('[ai/task] modal: persist assistant message failed', { spaceId }, err);
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          lineBuf += decoder.decode(value, { stream: true });
          const lines = lineBuf.split('\n');
          lineBuf = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;

            let evt: Record<string, unknown>;
            try {
              evt = JSON.parse(raw) as Record<string, unknown>;
            } catch {
              continue;
            }

            const type = typeof evt.type === 'string' ? evt.type : '';

            if (type === 'token') {
              const delta = String(evt.delta ?? '');
              textChunks.push(delta);
              blocks.push({ type: 'text', content: delta });
              push(controller, { type: 'text_delta', delta });

            } else if (type === 'reasoning_delta') {
              push(controller, { type: 'reasoning_delta', delta: String(evt.delta ?? '') });

            } else if (type === 'tool_call_start') {
              const toolName = String(evt.tool ?? 'tool');
              const toolArgs = (evt.args ?? {}) as Record<string, unknown>;
              // Use the SDK call_id Modal now forwards so the browser can
              // correlate the result back to this call; fall back to a fresh
              // id for older Modal deploys that don't send one.
              const callId =
                typeof evt.call_id === 'string' && evt.call_id
                  ? evt.call_id
                  : crypto.randomUUID();
              // Remember create_plan args so we can emit plan_created on result.
              if (toolName === 'create_plan') {
                pendingPlanArgs = toolArgs;
              }
              blocks.push({
                type: 'tool_call',
                callId,
                name: toolName,
                args: toolArgs,
                status: 'complete',
              });
              push(controller, {
                type: 'tool_call_start',
                name: toolName,
                args: toolArgs,
                callId,
              });

            } else if (type === 'tool_call_result') {
              const toolName = String(evt.tool ?? 'tool');
              const callId = typeof evt.call_id === 'string' ? evt.call_id : '';
              const ok = evt.ok !== false;
              const summary = String(evt.summary ?? '');
              // Settle the result onto its tool-call block — by call_id when
              // present, else the most recent still-unresolved tool call.
              for (let i = blocks.length - 1; i >= 0; i--) {
                const b = blocks[i];
                if (b.type !== 'tool_call') continue;
                if (callId ? b.callId === callId : !b.result) {
                  b.result = { ok, summary };
                  b.status = ok ? 'complete' : 'error';
                  break;
                }
              }
              // Emit plan_created before the result so the browser can render
              // the plan card immediately, before the tool call settles.
              if (toolName === 'create_plan' && pendingPlanArgs !== null) {
                const args = pendingPlanArgs;
                if (typeof args.task === 'string' && Array.isArray(args.steps)) {
                  push(controller, {
                    type: 'plan_created',
                    task: args.task,
                    steps: args.steps,
                  });
                }
                pendingPlanArgs = null;
              }
              push(controller, {
                type: 'tool_call_result',
                name: toolName,
                ok,
                summary,
                callId,
              });

            } else if (type === 'done') {
              const finalText =
                typeof evt.final_text === 'string' && evt.final_text.trim()
                  ? evt.final_text
                  : textChunks.join('');
              await persistOnce(finalText);
              push(controller, { type: 'turn_complete', reason: 'complete' });

            } else if (type === 'error') {
              // Persist whatever streamed before the failure so a mid-turn
              // Modal error doesn't erase the assistant message the user saw.
              await persistOnce();
              push(controller, { type: 'error', message: evt.message ?? 'Agent error' });
            }
          }
        }

        // Flush any remaining buffer
        if (lineBuf.startsWith('data: ')) {
          const raw = lineBuf.slice(6).trim();
          if (raw) {
            try {
              const evt = JSON.parse(raw) as Record<string, unknown>;
              if (evt.type === 'done') {
                const finalText =
                  typeof evt.final_text === 'string' && evt.final_text.trim()
                    ? evt.final_text
                    : textChunks.join('');
                await persistOnce(finalText);
                push(controller, { type: 'turn_complete', reason: 'complete' });
              }
            } catch {
              // ignore malformed trailing line
            }
          }
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          logger.error('[ai/task] modal stream read error', { spaceId }, err);
          push(controller, { type: 'error', message: chippiErrorMessage('internal') });
        }
      } finally {
        // Safety net — the stream ended with no `done`/`error` event (Modal
        // crash, dropped connection). Idempotent via the `persisted` flag.
        await persistOnce();
        controller.close();
        reader.releaseLock();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const spaceSlug = typeof body.spaceSlug === 'string' ? body.spaceSlug.trim() : '';
  const rawMessage = typeof body.message === 'string' ? body.message.trim() : '';
  if (!spaceSlug) return NextResponse.json({ error: 'spaceSlug required' }, { status: 400 });
  if (!rawMessage) return NextResponse.json({ error: 'message required' }, { status: 400 });
  if (rawMessage.length > 8000) {
    return NextResponse.json({ error: 'message too long (8000 char max)' }, { status: 400 });
  }

  const sanitized = sanitizeUserInput(rawMessage);
  if (!sanitized.safe) {
    return NextResponse.json(
      { error: 'Message blocked by safety filter', violations: sanitized.violations },
      { status: 400 },
    );
  }
  const message = sanitized.sanitized;

  const abortController = new AbortController();

  const ctxOrResponse = await resolveToolContext(spaceSlug, abortController.signal);
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx: ToolContext = ctxOrResponse;

  const { allowed } = await checkRateLimit(`ai:task:${ctx.userId}`, 30, 3600);
  if (!allowed) {
    return NextResponse.json({ error: chippiErrorMessage('rate_limited') }, { status: 429 });
  }

  const ip = getClientIp(req);
  const ipLimit = await checkRateLimit(`chat:ip:${ip}`, 30, 600);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: chippiErrorMessage('rate_limited') },
      { status: 429, headers: { 'Retry-After': '600' } },
    );
  }
  const spaceLimit = await checkRateLimit(`chat:space:${ctx.space.id}`, 60, 600);
  if (!spaceLimit.allowed) {
    return NextResponse.json(
      { error: chippiErrorMessage('rate_limited') },
      { status: 429, headers: { 'Retry-After': '600' } },
    );
  }

  try {
    const { data: agentSettingsRow } = await supabase
      .from('AgentSettings')
      .select('dailyTokenBudget')
      .eq('spaceId', ctx.space.id)
      .maybeSingle();

    const dailyTokenBudget: number =
      (agentSettingsRow?.dailyTokenBudget as number | null | undefined) ?? 500_000;

    const todayUtc = new Date().toISOString().slice(0, 10);
    const { data: usageRows } = await supabase
      .from('AgentTask')
      .select('inputTokens, outputTokens')
      .eq('spaceId', ctx.space.id)
      .gte('createdAt', `${todayUtc}T00:00:00.000Z`);

    const todayTokens = (usageRows ?? []).reduce(
      (sum: number, row: { inputTokens: number | null; outputTokens: number | null }) =>
        sum + (row.inputTokens ?? 0) + (row.outputTokens ?? 0),
      0,
    );

    if (todayTokens >= dailyTokenBudget) {
      logger.warn('[ai/task] daily token budget exceeded', {
        spaceId: ctx.space.id,
        todayTokens,
        dailyTokenBudget,
      });
      return NextResponse.json({ error: 'Daily token budget exceeded' }, { status: 429 });
    }
  } catch (err) {
    logger.warn('[ai/task] token budget check failed — continuing', { spaceSlug }, err);
  }

  let conversationId: string;
  try {
    conversationId = await resolveConversation(ctx.space.id, body.conversationId ?? null, message);
  } catch (err) {
    logger.error('[ai/task] conversation resolve failed', { spaceSlug }, err);
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 500 });
  }

  try {
    await saveUserMessage({ spaceId: ctx.space.id, conversationId, content: message });
  } catch (err) {
    logger.error('[ai/task] save user message failed', { spaceSlug }, err);
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 500 });
  }

  void (async () => {
    try {
      if (await hasEmittedTelemetry(ctx.space.id, 'chippi_first_message')) return;
      const signupAt = await getFirstEmittedAt(ctx.space.id, 'signup_completed');
      await emitTelemetry({
        event: 'chippi_first_message',
        spaceId: ctx.space.id,
        userId: ctx.userId,
        payload: {
          conversationId,
          messagePreview: message.slice(0, 50),
          secondsFromSignup: secondsBetween(signupAt, new Date()),
        },
      });
    } catch (err) {
      logger.warn('[ai/task] first-message telemetry failed', { spaceSlug }, err);
    }
  })();

  let history: HistoryRow[];
  try {
    history = await loadHistory(ctx.space.id, conversationId);
  } catch (err) {
    logger.warn('[ai/task] history load failed — continuing without it', { spaceSlug }, err);
    history = [];
  }

  if (history.length > 0) {
    const last = history[history.length - 1];
    if (last.role === 'user' && last.content === message) history.pop();
  }

  const hydratedAttachments = await hydrateAttachments(ctx.space.id, body.attachmentIds);

  // ── TS fallback (local dev without Modal) ────────────────────────────────
  if (chatRuntime() === 'ts') {
    logger.info('[ai/task] using in-process TS runtime (CHIPPI_CHAT_RUNTIME=ts)', { spaceSlug });
    return streamTsChatTurn({
      ctx,
      conversationId,
      userMessage: message,
      history,
      abortController,
    });
  }

  // ── Modal runtime (default) ──────────────────────────────────────────────
  const modalChatUrl = process.env.MODAL_CHAT_URL;
  if (!modalChatUrl) {
    logger.error('[ai/task] MODAL_CHAT_URL not set — cannot route to Modal sandbox', { spaceSlug });
    return NextResponse.json(
      { error: 'Agent backend not configured. Set MODAL_CHAT_URL.' },
      { status: 503 },
    );
  }

  const payload = {
    secret: process.env.AGENT_INTERNAL_SECRET ?? '',
    space_id: ctx.space.id,
    // Composio scopes connections per "entity" (Clerk userId). Without
    // this, Modal can't know which realtor's Gmail / Slack / etc. to
    // load — the agent ends up with zero integration tools regardless
    // of how many the realtor has connected. The Python side reads
    // `user_id` to look up active toolkits in IntegrationConnection
    // and load them via the Composio Python SDK.
    user_id: ctx.userId,
    message,
    history: history.map((h) => ({ role: h.role, content: h.content })),
    conversation_id: conversationId,
    attachments: hydratedAttachments,
  };

  let modalRes: Response;
  try {
    modalRes = await fetch(modalChatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: abortController.signal,
    });
  } catch (err) {
    logger.error('[ai/task] Modal fetch failed', { spaceSlug }, err);
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 502 });
  }

  if (!modalRes.ok || !modalRes.body) {
    const status = modalRes.status;
    logger.error('[ai/task] Modal returned error', { status, spaceSlug });
    return NextResponse.json({ error: chippiErrorMessage('internal') }, { status: 502 });
  }

  return proxyModalStream({
    modalBody: modalRes.body,
    spaceId: ctx.space.id,
    conversationId,
    abortController,
  });
}
