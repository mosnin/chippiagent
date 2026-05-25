/**
 * SDK bridge — verifies the conversion from our ToolDefinition to the
 * `@openai/agents` SDK's tool() shape and that the wrapped invoke routes
 * through our handler with our context.
 *
 * We do NOT run a full agent.run() flow here — that calls OpenAI and is
 * expensive/flaky. The bridge's job is the conversion + invoke wrapping;
 * that's what we assert. The SDK normalises our `execute` callback into
 * an `invoke(runCtx, jsonString)` method on the resulting tool.
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { Agent, RunContext, RunState } from '@openai/agents';
import { defineTool } from '@/lib/ai-tools/types';
import type { ToolContext } from '@/lib/ai-tools/types';
import {
  toSdkTool,
  summariseInterruption,
  extractApprovals,
  serializeRunState,
  restoreRunState,
  applyApprovalDecision,
} from '@/lib/ai-tools/sdk-bridge';

function makeCtx(): ToolContext {
  return {
    userId: 'u_1',
    space: { id: 's_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u_1' },
    signal: new AbortController().signal,
  };
}

describe('toSdkTool', () => {
  it('maps name, description, and zod parameters straight through', () => {
    const def = defineTool({
      name: 'find_widget',
      description: 'Find a widget by id.',
      parameters: z.object({ id: z.string() }),
      requiresApproval: false,
      handler: async () => ({ summary: 'found' }),
    });

    const sdk = toSdkTool(def, makeCtx());

    expect(sdk.name).toBe('find_widget');
    expect(sdk.description).toBe('Find a widget by id.');
    expect(sdk.type).toBe('function');
  });

  it('needsApproval resolves to false for read-only tools', async () => {
    const def = defineTool({
      name: 'read_thing',
      description: 'read',
      parameters: z.object({ id: z.string() }),
      requiresApproval: false,
      handler: async () => ({ summary: 'ok' }),
    });

    const sdk = toSdkTool(def, makeCtx());
    const approves = await sdk.needsApproval(new RunContext(), { id: 'x' });
    expect(approves).toBe(false);
  });

  it('needsApproval resolves to true for mutating tools with requiresApproval:true', async () => {
    const def = defineTool({
      name: 'mutate_thing',
      description: 'mutate',
      parameters: z.object({ id: z.string() }),
      requiresApproval: true,
      summariseCall: (args) => `Mutate ${args.id}`,
      rateLimit: { max: 60, windowSeconds: 3600 },
      handler: async () => ({ summary: 'mutated' }),
    });

    const sdk = toSdkTool(def, makeCtx());
    const approves = await sdk.needsApproval(new RunContext(), { id: 'x' });
    expect(approves).toBe(true);
  });

  it("forwards args + ctx to shouldApprove for requiresApproval:'maybe'", async () => {
    const shouldApprove = vi.fn(() => false);
    const def = defineTool({
      name: 'maybe_thing',
      description: 'maybe',
      parameters: z.object({ count: z.number() }),
      requiresApproval: 'maybe',
      shouldApprove: shouldApprove as (args: { count: number }, ctx: ToolContext) => boolean,
      summariseCall: (args) => `Process ${args.count}`,
      rateLimit: { max: 60, windowSeconds: 3600 },
      handler: async () => ({ summary: 'done' }),
    });

    const ctx = makeCtx();
    const sdk = toSdkTool(def, ctx);
    const result = await sdk.needsApproval(new RunContext(), { count: 5 });

    expect(result).toBe(false);
    expect(shouldApprove).toHaveBeenCalledWith({ count: 5 }, ctx);
  });

  it('invoke() runs our handler with parsed args + ctx and serialises summary back to the model', async () => {
    const handler = vi.fn(async () => ({ summary: 'found Jane Chen', display: 'success' as const }));
    const def = defineTool({
      name: 'find_jane',
      description: 'find Jane',
      parameters: z.object({ name: z.string() }),
      requiresApproval: false,
      handler,
    });

    const ctx = makeCtx();
    const sdk = toSdkTool(def, ctx);
    const out = await sdk.invoke(new RunContext(), JSON.stringify({ name: 'Jane' }));

    expect(handler).toHaveBeenCalledWith({ name: 'Jane' }, ctx);
    expect(out).toBe('found Jane Chen');
  });

  it('invoke() prefixes "Error: " when the handler returns display:"error" so the model recognises the failure', async () => {
    const def = defineTool({
      name: 'fragile_op',
      description: 'fragile',
      parameters: z.object({}),
      requiresApproval: false,
      handler: async () => ({ summary: 'something snapped', display: 'error' as const }),
    });

    const sdk = toSdkTool(def, makeCtx());
    const out = await sdk.invoke(new RunContext(), JSON.stringify({}));

    expect(out).toBe('Error: something snapped');
  });

  it('catches a throwing handler so a stack trace never reaches the model context', async () => {
    const def = defineTool({
      name: 'flaky_op',
      description: 'flaky',
      parameters: z.object({}),
      requiresApproval: false,
      handler: async () => {
        // The kind of exception a real DB / network call might throw —
        // we'd rather see "Error: flaky_op failed — Connection refused"
        // than a multi-line stack ending up in the chat transcript.
        throw new Error('Connection refused');
      },
    });

    const sdk = toSdkTool(def, makeCtx());
    const out = await sdk.invoke(new RunContext(), JSON.stringify({}));

    expect(out).toBe('Error: flaky_op failed — Connection refused');
  });

  it('catches non-Error throws (e.g. a plain string) without crashing the run', async () => {
    const def = defineTool({
      name: 'rude_op',
      description: 'rude',
      parameters: z.object({}),
      requiresApproval: false,
      handler: async () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'something exploded';
      },
    });

    const sdk = toSdkTool(def, makeCtx());
    const out = await sdk.invoke(new RunContext(), JSON.stringify({}));

    expect(out).toBe('Error: rude_op failed — something exploded');
  });
});

describe('toSdkTool — strict-mode schema rewriting', () => {
  /**
   * Walk the produced JSON schema and assert that NO constraint OpenAI
   * strict mode rejects is anywhere in the tree. This is the load-bearing
   * regression test — a new tool that uses `.url()` / `.email()` /
   * `.min()` / `.max()` / `.regex()` / `.datetime()` will fail the chat
   * in production. This test catches it locally.
   */
  function assertNoStrictModeViolations(schema: unknown): void {
    if (!schema || typeof schema !== 'object') return;
    const s = schema as Record<string, unknown>;
    const banned = [
      'format',
      'minLength',
      'maxLength',
      'minimum',
      'maximum',
      'minItems',
      'maxItems',
      'pattern',
      'multipleOf',
      'minProperties',
      'maxProperties',
      'uniqueItems',
    ];
    for (const key of banned) {
      if (key in s) {
        throw new Error(`Strict-mode-incompatible key "${key}" present in schema: ${JSON.stringify(schema)}`);
      }
    }
    // Recurse into nested schemas
    for (const value of Object.values(s)) {
      if (Array.isArray(value)) {
        for (const v of value) assertNoStrictModeViolations(v);
      } else if (value && typeof value === 'object') {
        assertNoStrictModeViolations(value);
      }
    }
  }

  it('strips `format: "uri"` from .url() fields (the add_property bug)', () => {
    const def = defineTool({
      name: 'add_property_like',
      description: 'mimics add_property',
      parameters: z.object({
        listingUrl: z.string().trim().url().max(2000).optional(),
      }),
      requiresApproval: false,
      handler: async () => ({ summary: 'ok' }),
    });
    const sdk = toSdkTool(def, makeCtx());
    const schema = (sdk as { parameters: unknown }).parameters;
    assertNoStrictModeViolations(schema);
  });

  it('strips `format: "date-time"` from .datetime() fields (block_time, check_availability)', () => {
    const def = defineTool({
      name: 'block_time_like',
      description: 'mimics block_time',
      parameters: z.object({
        from: z.string().datetime(),
        to: z.string().datetime(),
      }),
      requiresApproval: false,
      handler: async () => ({ summary: 'ok' }),
    });
    const sdk = toSdkTool(def, makeCtx());
    assertNoStrictModeViolations((sdk as { parameters: unknown }).parameters);
  });

  it('strips `format: "email"` and `format: "uuid"` from .email() / .uuid()', () => {
    const def = defineTool({
      name: 'email_like',
      description: 'mimics email',
      parameters: z.object({
        recipient: z.string().email(),
        threadId: z.string().uuid(),
      }),
      requiresApproval: false,
      handler: async () => ({ summary: 'ok' }),
    });
    const sdk = toSdkTool(def, makeCtx());
    assertNoStrictModeViolations((sdk as { parameters: unknown }).parameters);
  });

  it('strips minLength / maxLength / minimum / maximum / pattern', () => {
    const def = defineTool({
      name: 'limits_like',
      description: 'mimics tools with min/max',
      parameters: z.object({
        name: z.string().min(1).max(120),
        score: z.number().min(0).max(100),
        slug: z.string().regex(/^[a-z]+$/),
      }),
      requiresApproval: false,
      handler: async () => ({ summary: 'ok' }),
    });
    const sdk = toSdkTool(def, makeCtx());
    assertNoStrictModeViolations((sdk as { parameters: unknown }).parameters);
  });

  it('preserves enum values (strict mode allows enums)', () => {
    const def = defineTool({
      name: 'enum_like',
      description: 'mimics enum tools',
      parameters: z.object({
        tier: z.enum(['hot', 'warm', 'cold']).optional(),
      }),
      requiresApproval: false,
      handler: async () => ({ summary: 'ok' }),
    });
    const sdk = toSdkTool(def, makeCtx());
    const schema = JSON.stringify((sdk as { parameters: unknown }).parameters);
    expect(schema).toMatch(/"hot"/);
    expect(schema).toMatch(/"warm"/);
    expect(schema).toMatch(/"cold"/);
    assertNoStrictModeViolations((sdk as { parameters: unknown }).parameters);
  });

  it('recursively strips constraints inside nested objects and arrays', () => {
    const def = defineTool({
      name: 'nested',
      description: 'nested',
      parameters: z.object({
        attendees: z.array(z.string().email().min(1)),
        owner: z.object({
          email: z.string().email(),
          age: z.number().min(0).max(120),
        }),
      }),
      requiresApproval: false,
      handler: async () => ({ summary: 'ok' }),
    });
    const sdk = toSdkTool(def, makeCtx());
    assertNoStrictModeViolations((sdk as { parameters: unknown }).parameters);
  });

  it('keeps optional zod fields in the JSON schema as required + nullable so OpenAI strict mode accepts them', () => {
    const def = defineTool({
      name: 'find_widget',
      description: 'find a widget',
      parameters: z.object({
        query: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(8).optional().default(8),
      }),
      requiresApproval: false,
      handler: async () => ({ summary: 'ok' }),
    });

    const sdk = toSdkTool(def, makeCtx());
    // The SDK normalises our zod into a JSON schema on the `parameters`
    // field. Inspect it directly: every key in `properties` must also
    // appear in `required`, and the OPTIONAL fields must allow null.
    const schema = (sdk as { parameters: Record<string, unknown> }).parameters;
    const props = schema.properties as Record<string, unknown>;
    const required = schema.required as string[];

    expect(Object.keys(props).sort()).toEqual(['limit', 'query']);
    expect(required.sort()).toEqual(['limit', 'query']);
  });

  it('handler still receives null for fields the model passes as null (handlers use ?? defaults — null and undefined both fall through)', async () => {
    const handler = vi.fn(async () => ({ summary: 'ok' }));
    const def = defineTool({
      name: 'noop',
      description: 'noop',
      parameters: z.object({
        query: z.string().optional(),
      }),
      requiresApproval: false,
      handler,
    });

    const sdk = toSdkTool(def, makeCtx());
    await sdk.invoke(new RunContext(), JSON.stringify({ query: null }));
    expect(handler).toHaveBeenCalledWith({ query: null }, expect.anything());
  });

  it('handler receives string when the model provides one', async () => {
    const handler = vi.fn(async () => ({ summary: 'ok' }));
    const def = defineTool({
      name: 'noop',
      description: 'noop',
      parameters: z.object({
        query: z.string().optional(),
      }),
      requiresApproval: false,
      handler,
    });

    const sdk = toSdkTool(def, makeCtx());
    await sdk.invoke(new RunContext(), JSON.stringify({ query: 'sam' }));
    expect(handler).toHaveBeenCalledWith({ query: 'sam' }, expect.anything());
  });
});

describe('extractApprovals', () => {
  const registry = [
    defineTool({
      name: 'send_email',
      description: 'send',
      parameters: z.object({ to: z.string() }),
      requiresApproval: true,
      summariseCall: (args) => `Email ${args.to}`,
      rateLimit: { max: 60, windowSeconds: 3600 },
      handler: async () => ({ summary: 'sent' }),
    }),
  ];

  it('parses interruption arguments and renders summary via summariseCall', () => {
    const fakeResult = {
      interruptions: [
        {
          name: 'send_email',
          arguments: JSON.stringify({ to: 'jane@x.com' }),
          rawItem: { callId: 'call_123' },
        },
      ],
    };

    const out = extractApprovals(fakeResult, registry);

    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      callId: 'call_123',
      toolName: 'send_email',
      arguments: { to: 'jane@x.com' },
      summary: 'Email jane@x.com',
    });
  });

  it('falls back to rawItem.id when callId is absent (hosted-tool variants)', () => {
    const fakeResult = {
      interruptions: [
        {
          name: 'send_email',
          arguments: JSON.stringify({ to: 'a@b.c' }),
          rawItem: { id: 'tool_456' },
        },
      ],
    };

    const out = extractApprovals(fakeResult, registry);
    expect(out[0].callId).toBe('tool_456');
  });

  it('survives malformed JSON args by exposing the raw string', () => {
    const fakeResult = {
      interruptions: [
        { name: 'send_email', arguments: '{bad', rawItem: { callId: 'c' } },
      ],
    };

    const out = extractApprovals(fakeResult, registry);
    expect(out[0].arguments).toEqual({ raw: '{bad' });
  });

  it('returns empty array when there are no interruptions', () => {
    expect(extractApprovals({}, registry)).toEqual([]);
    expect(extractApprovals({ interruptions: [] }, registry)).toEqual([]);
  });
});

describe('serializeRunState / restoreRunState round-trip', () => {
  // We can't trigger a real interruption without a model call, but we CAN
  // verify the serialise/restore primitives the SDK exposes — that's what
  // closes the chat-cutover risk: any state we save can be reloaded.
  it('serializes a RunState to a string', () => {
    const state = { toString: () => 'fake-serialized-state' };
    expect(serializeRunState(state)).toBe('fake-serialized-state');
  });

  it('round-trips through RunState.fromString for an equivalent agent', async () => {
    // The shortest path that produces a real RunState we can persist:
    // build an Agent, construct an empty RunState (its constructor is
    // public for testing/resume), serialize, restore.
    const agent = new Agent({
      name: 'Probe',
      instructions: 'Probe',
      tools: [],
    });

    // RunState exposes a static `fromString`. The cheapest test that
    // proves the round-trip is to call the SDK's own probe — its types
    // and the SerializedRunState schema validate the format.
    const initial = new RunState(new RunContext(), 'hello', agent, 5);
    const serialized = serializeRunState(initial);
    expect(typeof serialized).toBe('string');
    expect(serialized.length).toBeGreaterThan(0);

    const restored = await restoreRunState(agent, serialized);
    // The restored state is a RunState instance. Its identity differs
    // (new object) but its serialised form matches.
    expect(serializeRunState(restored)).toBe(serialized);
  });
});

describe('applyApprovalDecision', () => {
  // We mock the state's approve/reject methods because constructing a
  // real RunState with a pending interruption requires a model round-trip.
  // The contract we're testing is OUR routing — not the SDK's mutation.
  function makeFakeState() {
    return {
      approve: vi.fn(),
      reject: vi.fn(),
    };
  }

  it('routes to approve() when the decision is approved', () => {
    const state = makeFakeState();
    const item = { rawItem: { callId: 'c1' }, name: 'send_email' };
    applyApprovalDecision(
      state as unknown as RunState<unknown, Agent<unknown, 'text'>>,
      item as unknown as Parameters<RunState<unknown, Agent<unknown, 'text'>>['approve']>[0],
      { approved: true },
    );
    expect(state.approve).toHaveBeenCalledWith(item);
    expect(state.reject).not.toHaveBeenCalled();
  });

  it('routes to reject() with no message when not provided', () => {
    const state = makeFakeState();
    const item = { rawItem: { callId: 'c1' } };
    applyApprovalDecision(
      state as unknown as RunState<unknown, Agent<unknown, 'text'>>,
      item as unknown as Parameters<RunState<unknown, Agent<unknown, 'text'>>['approve']>[0],
      { approved: false },
    );
    expect(state.reject).toHaveBeenCalledWith(item, undefined);
    expect(state.approve).not.toHaveBeenCalled();
  });

  it('passes a rejection message when provided', () => {
    const state = makeFakeState();
    const item = { rawItem: { callId: 'c1' } };
    applyApprovalDecision(
      state as unknown as RunState<unknown, Agent<unknown, 'text'>>,
      item as unknown as Parameters<RunState<unknown, Agent<unknown, 'text'>>['approve']>[0],
      { approved: false, message: 'wrong recipient' },
    );
    expect(state.reject).toHaveBeenCalledWith(item, { message: 'wrong recipient' });
  });
});

describe('summariseInterruption', () => {
  const registry = [
    defineTool({
      name: 'send_thing',
      description: 'send',
      parameters: z.object({ to: z.string() }),
      requiresApproval: true,
      summariseCall: (args) => `Send to ${args.to}`,
      rateLimit: { max: 60, windowSeconds: 3600 },
      handler: async () => ({ summary: 'sent' }),
    }),
  ];

  it('renders the realtor-facing approval message via the original tool definition', () => {
    expect(summariseInterruption('send_thing', { to: 'jane@x.com' }, registry)).toBe(
      'Send to jane@x.com',
    );
  });

  it('falls back to a generic prompt when the tool is unknown', () => {
    expect(summariseInterruption('mystery_tool', {}, registry)).toBe('Run mystery_tool');
  });
});
