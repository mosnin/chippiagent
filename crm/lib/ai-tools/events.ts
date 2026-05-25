/**
 * Typed SSE event protocol for the on-demand agent loop.
 *
 * The server emits a stream of these; the client renders each as a
 * transcript block. One union rather than ad-hoc shapes so both sides
 * narrow through the `type` discriminator. Keep the surface small —
 * adding event types later is fine, but each new type is a contract
 * the client has to handle.
 *
 * All events carry a monotonic `seq` so a reconnecting client can
 * resume without replaying prior events. Timestamps are ISO strings
 * for easy JSON round-trip.
 */

import type { ToolResult } from './types';

export type AgentEvent =
  | TextDeltaEvent
  | ReasoningDeltaEvent
  | ToolCallStartEvent
  | ToolCallResultEvent
  | PermissionRequiredEvent
  | PermissionResolvedEvent
  | PlanCreatedEvent
  | TurnCompleteEvent
  | ErrorEvent
  | SystemEvent;

interface BaseEvent {
  seq: number;
  ts: string;
}

/** A token of the assistant's reply text. Client appends to the current text block. */
export interface TextDeltaEvent extends BaseEvent {
  type: 'text_delta';
  /** The incremental text. May be empty. */
  delta: string;
}

/**
 * A chunk of the model's internal reasoning (thinking tokens). Streamed when
 * reasoning_effort is enabled on gpt-5-mini. The client accumulates these into
 * a collapsible "Thinking" section — they are NOT shown inline in the transcript.
 */
export interface ReasoningDeltaEvent extends BaseEvent {
  type: 'reasoning_delta';
  delta: string;
}

/** The loop is about to invoke a tool. Client creates a tool-call block in 'running' state. */
export interface ToolCallStartEvent extends BaseEvent {
  type: 'tool_call_start';
  callId: string;
  name: string;
  /** Parsed arguments. Already zod-validated server-side. */
  args: Record<string, unknown>;
  /** How the UI should render this call's result. */
  display?: ToolResult['display'];
}

/** The tool has returned. Client transitions its block to 'complete' or 'error'. */
export interface ToolCallResultEvent extends BaseEvent {
  type: 'tool_call_result';
  callId: string;
  ok: boolean;
  /** Human-readable summary. Shown inside the tool-call block. */
  summary: string;
  /** Optional structured payload for rich rendering. Opaque on the wire. */
  data?: unknown;
  /** Set when ok === false. */
  error?: string;
}

/**
 * A mutating tool call is pending the user's approval. The loop has paused.
 * Client renders an approval card; user's decision is POSTed to
 * /api/ai/task/approve/[requestId] (Phase 3).
 */
export interface PermissionRequiredEvent extends BaseEvent {
  type: 'permission_required';
  requestId: string;
  callId: string;
  name: string;
  args: Record<string, unknown>;
  /** Short "what will happen if you approve?" sentence for the UI. */
  summary: string;
  /** How the UI should render the approval preview. */
  display?: ToolResult['display'];
  /**
   * Other mutating calls the model emitted in the SAME parallel batch. The
   * orchestrator only prompts for one at a time, but the user's decision
   * cascades: a single deny skips every subsequent mutation in the batch
   * without nagging. The client uses this list to render PermissionBlocks
   * for the cascaded denials live, instead of only after a page reload —
   * server-side persistence has always recorded them, but the transcript
   * would lag the DB until refresh without this.
   */
  otherPendingCalls?: Array<{
    callId: string;
    name: string;
    args: Record<string, unknown>;
    summary: string;
  }>;
}

/**
 * The user approved or denied a pending call. Emitted after the approval
 * endpoint resolves — reassures the UI that the pending block has moved
 * on. The actual `tool_call_result` (or a `tool_call_start` → result
 * pair) follows in the same or next turn.
 */
export interface PermissionResolvedEvent extends BaseEvent {
  type: 'permission_resolved';
  requestId: string;
  callId: string;
  decision: 'approved' | 'denied';
  /** If the user edited arguments before approving, they're here. */
  editedArgs?: Record<string, unknown>;
}

/**
 * The agent has invoked the `create_plan` tool and a structured plan is ready
 * to be shown to the user before execution begins. The client renders a
 * PlanCard from this event; execution continues automatically after the plan
 * is displayed.
 */
export interface PlanCreatedEvent extends BaseEvent {
  type: 'plan_created';
  /** High-level description of what the agent is about to do. */
  task: string;
  /** Ordered list of steps the agent will execute. */
  steps: Array<{
    title: string;
    description: string;
  }>;
}

/** End-of-turn marker. Client disables the input until the user types again. */
export interface TurnCompleteEvent extends BaseEvent {
  type: 'turn_complete';
  /** 'complete' = model finished naturally. 'paused' = awaiting permission. 'aborted' = user cancelled / network dropped. */
  reason: 'complete' | 'paused' | 'aborted';
}

/**
 * Out-of-band notice from the infrastructure layer — not a model output.
 * Currently used to signal context compaction so the UI can show a subtle
 * indicator. The content field is human-readable but intentionally terse.
 */
export interface SystemEvent extends BaseEvent {
  type: 'system';
  content: string;
}

/** Unrecoverable turn failure. Different from a tool error (which keeps the turn alive). */
export interface ErrorEvent extends BaseEvent {
  type: 'error';
  /**
   * Human-facing message. The server replaces this with a Chippi-voiced line
   * (see lib/ai-tools/chippi-voice.ts) before shipping; the client renders
   * it inline as an assistant message rather than as a system warning.
   */
  message: string;
  /**
   * Machine-readable code so the client can pick its own Chippi line if the
   * server-supplied message gets through stale or empty.
   */
  code?:
    | 'rate_limited'
    | 'quota'
    | 'internal'
    | 'auth'
    | 'cold_start'
    | 'tool_failure'
    | 'budget_exhausted'
    | 'guardrail'
    | 'network';
}

// ── Wire format ────────────────────────────────────────────────────────────

/**
 * Encode an event as a Server-Sent Events frame. Each frame is newline-
 * delimited JSON under an event name so clients can either wire up
 * individual handlers per type or read a single onmessage stream.
 *
 *   event: tool_call_start
 *   data: {"seq":4,"ts":"...","type":"tool_call_start",...}
 *
 * Returns a Uint8Array so the caller can pipe directly into a
 * TransformStream / ReadableStream without another encoding pass.
 */
const encoder = new TextEncoder();

export function encodeEvent(event: AgentEvent): Uint8Array {
  const json = JSON.stringify(event);
  const frame = `event: ${event.type}\ndata: ${json}\n\n`;
  return encoder.encode(frame);
}

/**
 * Parse a single SSE data payload back into an AgentEvent. Used by tests
 * and by the Phase 4 client. Throws if the payload isn't a valid event.
 */
export function decodeEvent(data: string): AgentEvent {
  const parsed = JSON.parse(data) as AgentEvent;
  // Runtime shape check — the server encodes these; we still sanity-check
  // the fields everyone depends on.
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid event: not an object');
  }
  if (typeof (parsed as AgentEvent).type !== 'string') {
    throw new Error('Invalid event: missing type');
  }
  if (typeof (parsed as AgentEvent).seq !== 'number') {
    throw new Error('Invalid event: missing seq');
  }
  return parsed;
}

/**
 * Counter factory for producing monotonic `seq` values within a single
 * turn. Kept stateful-per-call so each turn starts at 0 independently.
 */
export function createSeqCounter(): () => number {
  let n = 0;
  return () => n++;
}

/**
 * Helper for the loop: stamp an event with `seq` + `ts` without requiring
 * each call-site to thread both. Usage:
 *
 *   const push = makeEventPusher(writer);
 *   push({ type: 'text_delta', delta: 'Hello' });
 */
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

/**
 * The event shape callers pass to `pushEvent` — an AgentEvent minus the
 * framing fields (`seq`, `ts`) which the pusher stamps on. Distributive
 * over the AgentEvent union so type-narrowing on `type` preserves the
 * variant-specific fields (`delta`, `reason`, `message`, etc.).
 */
export type PushableEvent = DistributiveOmit<AgentEvent, 'seq' | 'ts'>;

export function makeEventPusher(
  writer: WritableStreamDefaultWriter<Uint8Array>,
): (event: PushableEvent) => Promise<void> {
  const nextSeq = createSeqCounter();
  return async (event) => {
    const full = {
      ...event,
      seq: nextSeq(),
      ts: new Date().toISOString(),
    } as AgentEvent;
    await writer.write(encodeEvent(full));
  };
}
