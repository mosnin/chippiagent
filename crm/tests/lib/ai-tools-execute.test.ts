import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { defineTool, type ToolContext, type ToolDefinition } from '@/lib/ai-tools/types';

// ── Mock the registry so we control exactly what `getTool` returns ────────
// Keeping this in a variable so individual tests can swap the tool under
// test without rewriting the mock.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentTool: ToolDefinition<any, any> | null = null;

vi.mock('@/lib/ai-tools/registry', () => ({
  getTool: (name: string) => (currentTool && (currentTool as { name: string }).name === name ? currentTool : undefined),
  listTools: () => (currentTool ? [currentTool] : []),
  toolRequiresApproval: () => false,
}));

// Rate limit is allowed by default; tests can override per-case via
// rateLimitAllowed.
let rateLimitAllowed = true;
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: rateLimitAllowed, remaining: 0, resetAt: 0 })),
}));

// Import AFTER mocking so the real module binds to the mock.
import { executeTool, executionToModelMessage } from '@/lib/ai-tools/execute';

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: 'user_123',
    space: { id: 'space_abc', slug: 'jane', name: 'Jane Realty', ownerId: 'u1' },
    signal: new AbortController().signal,
    ...overrides,
  };
}

beforeEach(() => {
  currentTool = null;
  rateLimitAllowed = true;
});

describe('executeTool', () => {
  it('returns unknown_tool when no such tool is registered', async () => {
    const out = await executeTool('does_not_exist', {}, makeCtx());
    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe('unknown_tool');
    expect(out.error?.message).toMatch(/does_not_exist/);
  });

  it('returns invalid_args with zod issues when args fail validation', async () => {
    currentTool = defineTool({
      name: 'say_hello',
      description: 't',
      parameters: z.object({ name: z.string(), count: z.number().int().min(1) }),
      requiresApproval: false,
      handler: async () => ({ summary: '' }),
    });
    const out = await executeTool('say_hello', { name: 'Jane', count: 'many' }, makeCtx());
    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe('invalid_args');
    // Structured zod issues should be passed through for debugging.
    expect(
      (out.error as { issues?: unknown[] }).issues?.length,
    ).toBeGreaterThan(0);
    expect(out.error?.message).toMatch(/count/i);
  });

  it('returns invalid_args when a required field is missing', async () => {
    currentTool = defineTool({
      name: 'needs_name',
      description: 't',
      parameters: z.object({ name: z.string() }),
      requiresApproval: false,
      handler: async () => ({ summary: '' }),
    });
    const out = await executeTool('needs_name', {}, makeCtx());
    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe('invalid_args');
  });

  it('returns aborted when the signal is already aborted', async () => {
    currentTool = defineTool({
      name: 'whatever',
      description: 't',
      parameters: z.object({}),
      requiresApproval: false,
      handler: async () => ({ summary: 'should not run' }),
    });
    const controller = new AbortController();
    controller.abort();
    const handlerSpy = vi.fn(async () => ({ summary: 'should not run' }));
    currentTool = defineTool({
      name: 'whatever',
      description: 't',
      parameters: z.object({}),
      requiresApproval: false,
      handler: handlerSpy,
    });
    const out = await executeTool('whatever', {}, makeCtx({ signal: controller.signal }));
    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe('aborted');
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it('returns aborted when the signal fires during handler execution', async () => {
    const controller = new AbortController();
    currentTool = defineTool({
      name: 'slow',
      description: 't',
      parameters: z.object({}),
      requiresApproval: false,
      handler: async (_args, ctx) => {
        // Simulate the user aborting mid-call.
        controller.abort();
        void ctx; // ctx is threaded but unused in the test
        return { summary: 'done anyway' };
      },
    });
    const out = await executeTool('slow', {}, makeCtx({ signal: controller.signal }));
    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe('aborted');
  });

  it('captures thrown handler errors as handler_error', async () => {
    currentTool = defineTool({
      name: 'broken',
      description: 't',
      parameters: z.object({}),
      requiresApproval: false,
      handler: async () => {
        throw new Error('database offline');
      },
    });
    const out = await executeTool('broken', {}, makeCtx());
    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe('handler_error');
    expect(out.error?.message).toMatch(/database offline/);
  });

  it('returns ok with the ToolResult on success and passes through validated args', async () => {
    currentTool = defineTool({
      name: 'greet',
      description: 't',
      parameters: z.object({ name: z.string() }),
      requiresApproval: false,
      handler: async (args) => ({ summary: `Hello, ${args.name}.` }),
    });
    const out = await executeTool('greet', { name: 'Jane' }, makeCtx());
    expect(out.ok).toBe(true);
    expect(out.args).toEqual({ name: 'Jane' });
    expect(out.result?.summary).toBe('Hello, Jane.');
  });

  it('returns rate_limited and does NOT run the handler when the per-tool limit is exceeded', async () => {
    const handler = vi.fn(async () => ({ summary: 'should not run' }));
    currentTool = defineTool({
      name: 'limited',
      description: 't',
      parameters: z.object({}),
      requiresApproval: false,
      rateLimit: { max: 3, windowSeconds: 60 },
      handler,
    });
    rateLimitAllowed = false;
    const out = await executeTool('limited', {}, makeCtx());
    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe('rate_limited');
    expect(out.error?.message).toMatch(/limited/);
    expect(handler).not.toHaveBeenCalled();
  });

  it('skips the rate-limit check when the tool has no rateLimit configured', async () => {
    const handler = vi.fn(async () => ({ summary: 'ok' }));
    currentTool = defineTool({
      name: 'uncapped',
      description: 't',
      parameters: z.object({}),
      requiresApproval: false,
      handler,
    });
    // Even with rateLimitAllowed=false, an uncapped tool should still run.
    rateLimitAllowed = false;
    const out = await executeTool('uncapped', {}, makeCtx());
    expect(out.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('executionToModelMessage', () => {
  it('returns the ToolResult summary on success', () => {
    const msg = executionToModelMessage({
      ok: true,
      name: 'greet',
      args: {},
      result: { summary: 'Hi.' },
    });
    expect(msg).toBe('Hi.');
  });

  it('prefixes errors with ERROR (code) so the model can self-correct', () => {
    const msg = executionToModelMessage({
      ok: false,
      name: 'greet',
      error: { code: 'invalid_args', message: 'name is required' },
    });
    expect(msg).toMatch(/^ERROR \(invalid_args\):/);
    expect(msg).toMatch(/name is required/);
  });
});
