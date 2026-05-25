/**
 * The SSE-streaming wrapper around `runChatTurn`.
 *
 * Lives outside the route so the route stays a thin branch and so this
 * code can be exercised in tests without spinning up Next's request
 * machinery. Mirrors the shape of the Modal-side stream pump in
 * `app/api/ai/task/route.ts`: build a ReadableStream, push framed
 * AgentEvent JSON, persist the assistant message after the stream
 * closes, write any paused-run state if the SDK interrupted.
 *
 * Pause-and-resume:
 *   When the agent run finishes with `result.interruptions` non-empty,
 *   we serialize `result.state`, write a row to AgentPausedRun, and emit
 *   a `permission_required` event whose requestId is the new row id.
 *   The realtor's UI POSTs the decision to
 *   /api/ai/task/resume/[pausedRunId] which re-enters via `resumeChatTurn`.
 */

import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { AgentEvent, PushableEvent } from '@/lib/ai-tools/events';
import { createSeqCounter, encodeEvent } from '@/lib/ai-tools/events';
import { saveAssistantMessage } from '@/lib/ai-tools/persistence';
import type { ToolContext } from '@/lib/ai-tools/types';
import type { MessageBlock } from '@/lib/ai-tools/blocks';
import { chippiErrorMessage } from '@/lib/ai-tools/chippi-voice';
import { runChatTurn, resumeChatTurn } from '@/lib/ai-tools/sdk-chat';
import { mapSdkEvent, type SdkStreamEventLike } from '@/lib/ai-tools/sdk-event-mapper';
import { extractApprovals, serializeRunState } from '@/lib/ai-tools/sdk-bridge';
import { ALL_TOOLS } from '@/lib/ai-tools/tools';
import { emit as emitTelemetry } from '@/lib/telemetry';
import { logToolCallStart, logToolCallComplete, logToolCallError } from '@/lib/agent/tool-call-logger';
import { compactContext, estimateContextChars } from '@/lib/agent/compaction';

const COMPACTION_THRESHOLD_CHARS = 80_000;

interface HistoryRow {
  role: 'user' | 'assistant';
  content: string;
}

interface StreamTsChatTurnInput {
  ctx: ToolContext;
  conversationId: string;
  userMessage: string;
  /** Prior history, already deduped against the just-saved user turn. */
  history: HistoryRow[];
  abortController: AbortController;
}

export function streamTsChatTurn(input: StreamTsChatTurnInput): Response {
  // Run compaction synchronously-ish by capturing the async work in a
  // promise that resolves before `start` is awaited inside buildSseStream.
  // We need to mutate history before the agent call, so we do the work up
  // front and carry it into the closure.
  const initialEvents: PushableEvent[] = [];
  const historyPromise: Promise<HistoryRow[]> = (async () => {
    const history = input.history ?? [];
    if (estimateContextChars(history) > COMPACTION_THRESHOLD_CHARS) {
      try {
        const compacted = await compactContext({
          messages: history,
          maxContextChars: COMPACTION_THRESHOLD_CHARS,
          model: 'gpt-5-mini',
        });
        initialEvents.push({
          type: 'system',
          content: 'Context compacted to fit within model limits.',
        });
        return compacted.messages as HistoryRow[];
      } catch {
        // Non-blocking: compaction failure never stops the agent.
      }
    }
    return history;
  })();

  const stream = buildSseStream({
    ctx: input.ctx,
    conversationId: input.conversationId,
    abortController: input.abortController,
    initialEvents,
    start: async () => {
      const history = await historyPromise;
      const { result } = await runChatTurn({
        ctx: input.ctx,
        userMessage: input.userMessage,
        history,
      });
      return { result: result as unknown as SdkResultLike };
    },
  });
  return wrapAsResponse(stream, input.abortController);
}

// ── Resume entry point — used by /api/ai/task/resume/[pausedRunId] ─────────

interface StreamResumeInput {
  ctx: ToolContext;
  conversationId: string;
  serializedState: string;
  callId: string;
  decision: { approved: true } | { approved: false; message?: string };
  abortController: AbortController;
}

export function streamTsResumeTurn(input: StreamResumeInput): Response {
  const stream = buildSseStream({
    ctx: input.ctx,
    conversationId: input.conversationId,
    abortController: input.abortController,
    start: async () => {
      const { result } = await resumeChatTurn({
        ctx: input.ctx,
        serializedState: input.serializedState,
        callId: input.callId,
        decision: input.decision,
      });
      return { result: result as unknown as SdkResultLike };
    },
  });
  return wrapAsResponse(stream, input.abortController);
}

// ── Internals ──────────────────────────────────────────────────────────────

interface BuildStreamInput {
  ctx: ToolContext;
  conversationId: string;
  abortController: AbortController;
  /** Returns the SDK streamed result. Either fresh or resumed. */
  start: () => Promise<{ result: SdkResultLike }>;
  /**
   * Events to push immediately after the stream opens, before the agent
   * call fires. Used to relay compaction notices assembled before the
   * ReadableStream constructor ran (where pushEvent isn't yet available).
   */
  initialEvents?: PushableEvent[];
}

/**
 * What we actually need from the SDK streamed result. Loose so tests can
 * pass plain objects and so we don't lock to a specific SDK type for an
 * internal helper.
 */
interface SdkResultLike {
  toStream(): ReadableStream<unknown> | { getReader(): ReadableStreamDefaultReader<unknown> };
  completed: Promise<void>;
  interruptions?: ReadonlyArray<unknown>;
  state?: { toString(): string };
}

function buildSseStream(input: BuildStreamInput): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const nextSeq = createSeqCounter();
      let textBuffer = '';

      // Track the assistant text that's accumulated since the last tool
      // call landed. This is the "reasoning" we pin to the next tool
      // call's telemetry — the sentence the realtor sees before the
      // approval prompt. Reset on every tool_call_start.
      let reasoningBuffer = '';

      // Maps callId → ExecutionStep id so we can correlate tool_call_result
      // back to the row we inserted on tool_call_start.
      const callIdToStepId = new Map<string, string>();

      // Drain any events that were queued before the stream opened
      // (e.g. compaction notice assembled in streamTsChatTurn).
      // We define pushEvent first and call it immediately after.
      const pushEvent = (event: PushableEvent) => {
        if (event.type === 'text_delta') {
          textBuffer += event.delta;
          reasoningBuffer += event.delta;
        }
        if (event.type === 'tool_call_start') {
          // When the agent invokes `create_plan`, emit a `plan_created` event
          // immediately so the frontend can render the PlanCard before any
          // further tool calls fire. The tool itself is a no-op on the server
          // (no side effects); its value is purely the plan it carries.
          if (event.name === 'create_plan') {
            const args = event.args as { task?: unknown; steps?: unknown };
            const task = typeof args.task === 'string' ? args.task : '';
            const steps = Array.isArray(args.steps)
              ? (args.steps as Array<Record<string, unknown>>).map((s) => ({
                  title: typeof s['title'] === 'string' ? s['title'] : '',
                  description: typeof s['description'] === 'string' ? s['description'] : '',
                }))
              : [];
            pushEvent({ type: 'plan_created', task, steps });
          }

          // Fire-and-forget — telemetry must never block the stream.
          // Trim aggressively; we want the closest preceding sentence,
          // not the whole turn's prose.
          const reasoning = trimReasoning(reasoningBuffer);
          void emitTelemetry({
            event: 'agent_tool_called',
            spaceId: input.ctx.space.id,
            userId: input.ctx.userId,
            payload: {
              toolName: event.name,
              callId: event.callId,
              args: event.args,
              reasoning,
              conversationId: input.conversationId,
            },
          });
          // Reset for the next tool call. If multiple tool calls fire
          // back-to-back without intervening text, the reasoning for
          // the second one is empty — that's honest.
          reasoningBuffer = '';

          // Fire-and-forget ExecutionStep logging. Never awaited — must not
          // block or affect the stream in any way.
          void logToolCallStart(
            input.ctx.space.id,
            event.name,
            event.args,
            undefined,
          ).then((stepId) => {
            callIdToStepId.set(event.callId, stepId);
          }).catch(() => {});
        }

        if (event.type === 'tool_call_result') {
          const stepId = callIdToStepId.get(event.callId);
          if (stepId) {
            callIdToStepId.delete(event.callId);
            if (event.ok) {
              void logToolCallComplete(stepId, event.summary).catch(() => {});
            } else {
              void logToolCallError(stepId, event.error ?? event.summary).catch(() => {});
            }
          }
        }
        const full = { ...event, seq: nextSeq(), ts: new Date().toISOString() } as AgentEvent;
        try {
          controller.enqueue(encodeEvent(full));
        } catch {
          /* controller already closed */
        }
      };

      // Emit any events queued before the stream opened (e.g. compaction notice).
      for (const ev of input.initialEvents ?? []) {
        pushEvent(ev);
      }

      let result: SdkResultLike;
      try {
        ({ result } = await input.start());
      } catch (err) {
        const aborted = (err as { name?: string })?.name === 'AbortError';
        if (!aborted) {
          logger.error('[ai/task ts] start failed', { conversationId: input.conversationId }, err);
          pushEvent({
            type: 'error',
            message: chippiErrorMessage('internal'),
            code: 'internal',
          });
        }
        controller.close();
        return;
      }

      try {
        const stream = result.toStream() as { getReader(): ReadableStreamDefaultReader<unknown> };
        const reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const mapped = mapSdkEvent(value as SdkStreamEventLike, ALL_TOOLS);
          if (mapped) pushEvent(mapped);
        }
        // Block until the SDK declares the run complete so result.interruptions
        // and result.state are stable before we read them.
        await result.completed;

        // Pause path: if the run paused for approval, persist the state,
        // emit permission_required with the AgentPausedRun id as requestId,
        // and report the turn as paused.
        if (result.interruptions && result.interruptions.length > 0 && result.state) {
          const pausedRunId = await persistPausedRun({
            ctx: input.ctx,
            conversationId: input.conversationId,
            state: result.state,
            interruptions: result.interruptions,
          });
          if (pausedRunId) {
            // The mapper already pushed a permission_required event keyed
            // by callId. Emit a fresh one with the AgentPausedRun id as
            // requestId so the resume route knows where to PATCH.
            const approvals = extractApprovals(
              { interruptions: result.interruptions as Array<{
                rawItem: { callId?: string; id?: string };
                name?: string;
                arguments?: string;
              }> },
              ALL_TOOLS,
            );
            const first = approvals[0];
            if (first) {
              pushEvent({
                type: 'permission_required',
                requestId: pausedRunId,
                callId: first.callId,
                name: first.toolName,
                args: asRecord(first.arguments),
                summary: first.summary,
                otherPendingCalls: approvals.slice(1).map((a) => ({
                  callId: a.callId,
                  name: a.toolName,
                  args: asRecord(a.arguments),
                  summary: a.summary,
                })),
              });
            }
          }
          pushEvent({ type: 'turn_complete', reason: 'paused' });
        } else {
          pushEvent({ type: 'turn_complete', reason: 'complete' });
        }
      } catch (err) {
        const aborted = (err as { name?: string })?.name === 'AbortError';
        if (!aborted) {
          logger.error('[ai/task ts] stream pump crashed', { conversationId: input.conversationId }, err);
          pushEvent({
            type: 'error',
            message: chippiErrorMessage('internal'),
            code: 'internal',
          });
        }
      } finally {
        // Persist the assistant text. Empty buffers are normal on a paused
        // turn (the model hasn't said anything yet) — saveAssistantMessage
        // handles the empty-text case with a placeholder.
        if (textBuffer.trim()) {
          try {
            const blocks: MessageBlock[] = [{ type: 'text', content: textBuffer }];
            await saveAssistantMessage({
              spaceId: input.ctx.space.id,
              conversationId: input.conversationId,
              blocks,
            });
          } catch (err) {
            logger.error('[ai/task ts] save assistant message failed', {
              conversationId: input.conversationId,
            }, err);
          }
        }
        controller.close();
      }
    },
    cancel() {
      input.abortController.abort();
    },
  });
}

// ── Pause-and-resume persistence ───────────────────────────────────────────

interface PersistPausedInput {
  ctx: ToolContext;
  conversationId: string;
  state: { toString(): string };
  interruptions: ReadonlyArray<unknown>;
}

/**
 * Insert one AgentPausedRun row carrying the SDK's serialized state plus
 * the realtor-facing approval prompts. Returns the new row id, or null
 * on failure (the route still emits the event keyed by callId so the UI
 * isn't completely silent).
 */
async function persistPausedRun(input: PersistPausedInput): Promise<string | null> {
  try {
    const id = crypto.randomUUID();
    const now = Date.now();
    const expires = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    const approvals = extractApprovals(
      {
        interruptions: input.interruptions as Array<{
          rawItem: { callId?: string; id?: string };
          name?: string;
          arguments?: string;
        }>,
      },
      ALL_TOOLS,
    );
    const { error } = await supabase.from('AgentPausedRun').insert({
      id,
      spaceId: input.ctx.space.id,
      userId: input.ctx.userId,
      conversationId: input.conversationId,
      runState: serializeRunState(input.state),
      approvals,
      status: 'pending',
      expiresAt: expires,
    });
    if (error) {
      logger.error('[ai/task ts] persistPausedRun failed', { conversationId: input.conversationId }, error);
      return null;
    }
    return id;
  } catch (err) {
    logger.error('[ai/task ts] persistPausedRun threw', { conversationId: input.conversationId }, err);
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * The agent's reasoning sentence — the last thing the model said before
 * deciding to fire a tool. We keep it short: enough to capture WHY the
 * tool fired without dumping a paragraph into telemetry. Falls back to
 * an empty string when the model went straight from history to tool
 * (which is honest — there was no spoken reason).
 */
function trimReasoning(buffer: string): string {
  const cleaned = buffer.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  // Last sentence-ish chunk. Match from the latest sentence break to end.
  const parts = cleaned.split(/(?<=[.!?])\s+/);
  const last = parts[parts.length - 1] ?? cleaned;
  return last.length > 280 ? last.slice(0, 277) + '…' : last;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function wrapAsResponse(stream: ReadableStream<Uint8Array>, _abort: AbortController): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
