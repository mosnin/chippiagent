/**
 * SDK event mapper — verifies every kind of stream event we might see from
 * `@openai/agents` produces (or correctly suppresses) the right SSE event
 * the existing chat client renders.
 *
 * We pass plain objects in the SDK's event SHAPE — not the SDK classes —
 * because the mapper duck-types these. That keeps the test independent
 * of internal class identity across SDK patch versions.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineTool } from '@/lib/ai-tools/types';
import { mapSdkEvent } from '@/lib/ai-tools/sdk-event-mapper';

// A registry containing the one mutating tool used in the approval test.
const REGISTRY = [
  defineTool({
    name: 'send_email',
    description: 'Send an email.',
    parameters: z.object({ to: z.string(), subject: z.string() }),
    requiresApproval: true,
    summariseCall: (args) => `Email ${args.to}: ${args.subject}`,
    rateLimit: { max: 60, windowSeconds: 3600 },
    handler: async () => ({ summary: 'sent' }),
  }),
];

describe('mapSdkEvent — raw model stream', () => {
  it('maps output_text_delta to text_delta', () => {
    const out = mapSdkEvent({
      type: 'raw_model_stream_event',
      data: { type: 'output_text_delta', delta: 'Hello' },
    });
    expect(out).toEqual({ type: 'text_delta', delta: 'Hello' });
  });

  it('drops empty text deltas to avoid spamming the UI', () => {
    expect(
      mapSdkEvent({
        type: 'raw_model_stream_event',
        data: { type: 'output_text_delta', delta: '' },
      }),
    ).toBeNull();
  });

  it('returns null for non-text raw events (response_started, response_done, etc.)', () => {
    expect(
      mapSdkEvent({
        type: 'raw_model_stream_event',
        data: { type: 'response_started' },
      }),
    ).toBeNull();
    expect(
      mapSdkEvent({
        type: 'raw_model_stream_event',
        data: { type: 'response_done' },
      }),
    ).toBeNull();
  });
});

describe('mapSdkEvent — tool calls', () => {
  it('maps tool_called to tool_call_start with parsed args', () => {
    const out = mapSdkEvent({
      type: 'run_item_stream_event',
      name: 'tool_called',
      item: {
        type: 'tool_call_item',
        rawItem: {
          callId: 'call_abc',
          name: 'find_person',
          arguments: JSON.stringify({ name: 'Jane' }),
        },
      },
    });
    expect(out).toEqual({
      type: 'tool_call_start',
      callId: 'call_abc',
      name: 'find_person',
      args: { name: 'Jane' },
    });
  });

  it('maps tool_output (success) to tool_call_result with ok:true', () => {
    const out = mapSdkEvent({
      type: 'run_item_stream_event',
      name: 'tool_output',
      item: {
        type: 'tool_call_output_item',
        rawItem: { callId: 'call_abc' },
        output: 'found 3 hot people',
      },
    });
    expect(out).toEqual({
      type: 'tool_call_result',
      callId: 'call_abc',
      ok: true,
      summary: 'found 3 hot people',
    });
  });

  it('maps tool_output (error) — strips the "Error: " prefix and reports ok:false', () => {
    const out = mapSdkEvent({
      type: 'run_item_stream_event',
      name: 'tool_output',
      item: {
        type: 'tool_call_output_item',
        rawItem: { callId: 'call_abc' },
        output: 'Error: rate limited',
      },
    });
    expect(out).toEqual({
      type: 'tool_call_result',
      callId: 'call_abc',
      ok: false,
      summary: 'rate limited',
      error: 'rate limited',
    });
  });

  it('returns null for tool_called without a callId (model malformed)', () => {
    const out = mapSdkEvent({
      type: 'run_item_stream_event',
      name: 'tool_called',
      item: {
        type: 'tool_call_item',
        rawItem: { name: 'find_person', arguments: '{}' },
      },
    });
    expect(out).toBeNull();
  });

  it('survives malformed JSON args by emitting an empty args object', () => {
    const out = mapSdkEvent({
      type: 'run_item_stream_event',
      name: 'tool_called',
      item: {
        type: 'tool_call_item',
        rawItem: { callId: 'c1', name: 't', arguments: '{not-json' },
      },
    });
    expect(out).toEqual({
      type: 'tool_call_start',
      callId: 'c1',
      name: 't',
      args: {},
    });
  });
});

describe('mapSdkEvent — approval requests', () => {
  it('maps tool_approval_requested to permission_required with realtor-facing summary', () => {
    const out = mapSdkEvent(
      {
        type: 'run_item_stream_event',
        name: 'tool_approval_requested',
        item: {
          type: 'tool_approval_item',
          toolName: 'send_email',
          rawItem: {
            callId: 'call_xyz',
            arguments: JSON.stringify({ to: 'jane@x.com', subject: 'Hi' }),
          },
        },
      },
      REGISTRY,
    );
    expect(out).toEqual({
      type: 'permission_required',
      requestId: 'call_xyz',
      callId: 'call_xyz',
      name: 'send_email',
      args: { to: 'jane@x.com', subject: 'Hi' },
      summary: 'Email jane@x.com: Hi',
    });
  });

  it('falls back to a generic summary when the tool is unknown to the registry', () => {
    const out = mapSdkEvent(
      {
        type: 'run_item_stream_event',
        name: 'tool_approval_requested',
        item: {
          type: 'tool_approval_item',
          toolName: 'mystery_tool',
          rawItem: { callId: 'c', arguments: '{}' },
        },
      },
      [],
    );
    expect(out).toMatchObject({
      type: 'permission_required',
      callId: 'c',
      name: 'mystery_tool',
      summary: 'Run mystery_tool',
    });
  });
});

describe('mapSdkEvent — handoffs', () => {
  it('surfaces handoff_requested as a text_delta annotation', () => {
    const out = mapSdkEvent({
      type: 'run_item_stream_event',
      name: 'handoff_requested',
      item: {
        type: 'handoff_call_item',
        agent: { name: 'pipeline_analyst' },
      },
    });
    expect(out).toEqual({
      type: 'text_delta',
      delta: '\n\n_Handing off to pipeline_analyst_\n\n',
    });
  });

  it('surfaces handoff_occurred as a text_delta annotation', () => {
    const out = mapSdkEvent({
      type: 'run_item_stream_event',
      name: 'handoff_occurred',
      item: {
        type: 'handoff_output_item',
        agent: { name: 'pipeline_analyst' },
      },
    });
    expect(out).toEqual({
      type: 'text_delta',
      delta: '\n\n_Handoff to pipeline_analyst_\n\n',
    });
  });

  it('returns null for agent_updated_stream_event (suppressed; handoff items already note the change)', () => {
    expect(
      mapSdkEvent({
        type: 'agent_updated_stream_event',
        agent: { name: 'pipeline_analyst' },
      }),
    ).toBeNull();
  });
});

describe('mapSdkEvent — suppressed events', () => {
  it('suppresses message_output_created (text already streamed via raw model events)', () => {
    expect(
      mapSdkEvent({
        type: 'run_item_stream_event',
        name: 'message_output_created',
        item: { type: 'message_output_item', rawItem: { content: [] } },
      }),
    ).toBeNull();
  });

  it('suppresses model-internal events: tool_search_called, tool_search_output_created, reasoning_item_created', () => {
    for (const name of ['tool_search_called', 'tool_search_output_created', 'reasoning_item_created'] as const) {
      expect(
        mapSdkEvent({
          type: 'run_item_stream_event',
          name,
          item: { type: 'x' },
        }),
      ).toBeNull();
    }
  });

  it('returns null for unknown top-level event types (forward compatibility)', () => {
    // Cast through unknown — we're testing forward-compatibility on
    // events the SDK might add in a future version.
    expect(
      mapSdkEvent({ type: 'some_future_event' } as unknown as Parameters<typeof mapSdkEvent>[0]),
    ).toBeNull();
  });
});
