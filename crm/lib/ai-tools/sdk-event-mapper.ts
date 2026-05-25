/**
 * Translate `@openai/agents` stream events into our existing SSE event
 * shape (`lib/ai-tools/events.ts`). The chat client already renders our
 * shape — by mapping at the edge we keep the UI untouched.
 *
 * The SDK union has three top-level variants:
 *
 *   - `raw_model_stream_event`   — token-level data straight from the model
 *   - `run_item_stream_event`    — high-level items (messages, tool calls,
 *                                  tool outputs, handoffs, approvals)
 *   - `agent_updated_stream_event` — the active agent changed (handoff)
 *
 * For PR 1 we surface text deltas, tool starts, tool outputs, and approval
 * requests. Handoffs are surfaced as a generic informational text delta
 * (matching what the Modal route does today) so the realtor sees the
 * sub-agent transition without us having to add a new client event type
 * before the handoff-agent code lands in PR 2.
 *
 * We deliberately return `null` for everything we don't surface. The model's
 * intermediate reasoning, raw JSON arg streaming during a tool call, and
 * the per-step tool-search churn would only confuse the realtor — the
 * existing UI never showed any of it on the Modal path either.
 */

import type { PushableEvent } from './events';
import { extractApprovals, type ApprovalPrompt } from './sdk-bridge';
import type { ToolDefinition, ToolResult } from './types';

// ── Loose shapes ───────────────────────────────────────────────────────────
//
// We type the SDK events through narrow ducks rather than importing the
// classes. The classes live in `@openai/agents-core` internals, are not
// stable across patch versions, and our code only touches a tiny surface.
// Keeping the shapes local also makes the mapper trivially mockable in
// tests — pass a plain object, get an event back.

type RawModelEvent = {
  type: 'raw_model_stream_event';
  data: { type?: string; delta?: string };
};

type RunItemEventName =
  | 'message_output_created'
  | 'handoff_requested'
  | 'handoff_occurred'
  | 'tool_search_called'
  | 'tool_search_output_created'
  | 'tool_called'
  | 'tool_output'
  | 'reasoning_item_created'
  | 'tool_approval_requested';

type RunItemEvent = {
  type: 'run_item_stream_event';
  name: RunItemEventName;
  item: {
    type: string;
    rawItem?: {
      callId?: string;
      id?: string;
      name?: string;
      arguments?: string;
      content?: unknown;
      output?: unknown;
    };
    output?: unknown;
    name?: string;
    arguments?: string;
    toolName?: string;
    agent?: { name?: string };
  };
};

type AgentUpdatedEvent = {
  type: 'agent_updated_stream_event';
  agent: { name?: string };
};

export type SdkStreamEventLike = RawModelEvent | RunItemEvent | AgentUpdatedEvent;

// ── Approval registry shape (matches sdk-bridge.SummariseSource) ───────────

type SummariseSource = {
  name: string;
  requiresApproval: boolean | 'maybe';
  summariseCall?: (args: never) => string;
};

// ── The mapper ─────────────────────────────────────────────────────────────

/**
 * Map one SDK event to one (or zero) Pushable SSE events.
 *
 * The `registry` is the realtor-facing tool list — we use it ONLY to render
 * the approval summary via `extractApprovals`. The chat route passes
 * `ALL_TOOLS` down so summaries match the model's actual catalog.
 */
export function mapSdkEvent(
  event: SdkStreamEventLike,
  registry: readonly SummariseSource[] = [],
): PushableEvent | null {
  switch (event.type) {
    case 'raw_model_stream_event':
      return mapRawModelEvent(event);
    case 'run_item_stream_event':
      return mapRunItemEvent(event, registry);
    case 'agent_updated_stream_event':
      return mapAgentUpdated(event);
    default:
      return null;
  }
}

function mapRawModelEvent(event: RawModelEvent): PushableEvent | null {
  // Only surface output_text_delta. Everything else (response_started,
  // response_done, etc.) is wire-protocol noise.
  if (event.data?.type === 'output_text_delta' && typeof event.data.delta === 'string') {
    if (event.data.delta.length === 0) return null;
    return { type: 'text_delta', delta: event.data.delta };
  }
  return null;
}

function mapRunItemEvent(
  event: RunItemEvent,
  registry: readonly SummariseSource[],
): PushableEvent | null {
  switch (event.name) {
    case 'tool_called': {
      // SDK's `tool_call_item` carries `rawItem` shaped per protocol.
      // function_call → { callId, name, arguments } where arguments is a
      // JSON string the model produced.
      const raw = event.item.rawItem;
      const callId = raw?.callId ?? raw?.id ?? '';
      const name = raw?.name ?? event.item.name ?? '';
      const args = parseJsonObject(raw?.arguments);
      if (!callId || !name) return null;
      return { type: 'tool_call_start', callId, name, args };
    }

    case 'tool_output': {
      // Correlate strictly by callId — the field that references the
      // originating call. An output item's own `id` is its identity, never a
      // valid correlation key; falling back to it mismatched the result
      // against its tool_call_start (tool stuck "running", step never closed).
      const raw = event.item.rawItem;
      const callId = raw?.callId ?? '';
      const summary = stringifyOutput(event.item.output ?? raw?.output);
      const ok = !summary.startsWith('Error: ');
      const cleanSummary = ok ? summary : summary.slice('Error: '.length);
      if (!callId) return null;
      return {
        type: 'tool_call_result',
        callId,
        ok,
        summary: cleanSummary,
        ...(ok ? {} : { error: cleanSummary }),
      };
    }

    case 'tool_approval_requested': {
      // Reuse the bridge's extractor so the realtor-facing summary is the
      // exact same text the existing UI already renders.
      const approvals = extractApprovals(
        { interruptions: [interruptionFrom(event.item)] },
        registry,
      );
      const first: ApprovalPrompt | undefined = approvals[0];
      if (!first) return null;
      return {
        type: 'permission_required',
        // PR 1: requestId mirrors the callId until the resume route assigns
        // the AgentPausedRun id. The chat UI doesn't use requestId for
        // anything other than echoing it back on approve/deny — both are
        // rewritten downstream to the AgentPausedRun id when the route
        // persists the paused run.
        requestId: first.callId,
        callId: first.callId,
        name: first.toolName,
        args: asRecord(first.arguments),
        summary: first.summary,
      };
    }

    case 'message_output_created': {
      // The SDK emits this once the assistant message item is finalised.
      // We DON'T re-emit text here — the raw_model_stream_event path
      // already streamed every token. Returning null avoids duplicating
      // the message in the transcript.
      return null;
    }

    case 'handoff_requested':
    case 'handoff_occurred': {
      // PR 1 has no client event for sub-agent handoffs. Surface as a
      // text_delta annotation — same pattern the Modal route uses today
      // (lib/ai-tools/route.ts translate() handoff branch). Keeps the
      // realtor informed without forcing a client-side change.
      const target = event.item.agent?.name ?? event.item.toolName ?? 'sub-agent';
      const verb = event.name === 'handoff_requested' ? 'Handing off to' : 'Handoff to';
      return { type: 'text_delta', delta: `\n\n_${verb} ${target}_\n\n` };
    }

    case 'tool_search_called':
    case 'tool_search_output_created':
      // Model-internal — not user-facing. Drop.
      return null;

    case 'reasoning_item_created': {
      // The SDK delivers reasoning as a single finalised item with a content
      // array of { type: 'reasoning_text' | 'input_text', text }. We extract
      // the reasoning_text segments and emit them as one delta — the
      // client-side buffer concatenates and renders a collapsible trace.
      // Drop silently if the model doesn't produce reasoning (most don't
      // unless reasoning_effort is enabled).
      const raw = (event.item as { rawItem?: { content?: Array<{ type?: string; text?: string }> } }).rawItem;
      const chunks = Array.isArray(raw?.content) ? raw.content : [];
      const text = chunks
        .filter((c) => c?.type === 'reasoning_text' && typeof c.text === 'string')
        .map((c) => c.text as string)
        .join('');
      if (!text) return null;
      return { type: 'reasoning_delta', delta: text };
    }

    default:
      return null;
  }
}

function mapAgentUpdated(event: AgentUpdatedEvent): PushableEvent | null {
  // This fires when a handoff swaps the active agent. The handoff_requested /
  // handoff_occurred RunItem events already produced a visible note, so we
  // suppress this one to avoid double-rendering.
  void event;
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseJsonObject(s: string | undefined): Record<string, unknown> {
  if (!s) return {};
  try {
    const parsed = JSON.parse(s);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function stringifyOutput(o: unknown): string {
  if (typeof o === 'string') return o;
  if (o == null) return '';
  if (typeof o === 'object') {
    // The SDK sometimes wraps tool outputs as { type: 'text', text: '...' }
    const obj = o as { text?: unknown; output?: unknown };
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.output === 'string') return obj.output;
    try {
      return JSON.stringify(o);
    } catch {
      return String(o);
    }
  }
  return String(o);
}

function interruptionFrom(item: RunItemEvent['item']) {
  // Shape extractApprovals expects: { name, arguments, rawItem: {...} }
  return {
    name: item.toolName ?? item.rawItem?.name ?? item.name ?? '',
    arguments: item.rawItem?.arguments ?? item.arguments ?? '',
    rawItem: {
      callId: item.rawItem?.callId,
      id: item.rawItem?.id,
    },
  };
}

// Re-export for tests + consumers — nothing else depends on it but the
// test file wants to type its fixtures.
export type { ToolDefinition, ToolResult };
