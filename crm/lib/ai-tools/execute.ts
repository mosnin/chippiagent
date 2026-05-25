/**
 * The boundary between "model emitted a tool call" and "handler ran".
 *
 * Every path the loop could hit when invoking a tool needs a typed return —
 * tool not in registry, invalid args, handler threw, turn aborted, handler
 * succeeded. Keeping that surface isolated here means the Phase 2 loop is
 * just a dispatcher, and each failure mode is unit-tested in isolation.
 *
 * Raw args come in as `unknown` because the model can emit anything; we
 * parse them through the tool's zod schema and produce a helpful error
 * for the model to self-correct on the next turn.
 */

import { z } from 'zod';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { getTool } from './registry';
import type { ToolContext, ToolDefinition, ToolResult } from './types';

export type ToolExecutionError =
  | { code: 'unknown_tool'; message: string }
  | { code: 'invalid_args'; message: string; issues?: z.ZodIssue[] }
  | { code: 'handler_error'; message: string }
  | { code: 'rate_limited'; message: string }
  | { code: 'aborted'; message: string };

/** Render a window duration as "hour" / "minute" / "N minutes" — rate-limit
 *  error messages read better with units than raw seconds or blindly-rounded
 *  minutes ("1 min" when the real window is 60 minutes is worse than "hour"). */
function formatWindow(windowSeconds: number): string {
  if (windowSeconds === 3600) return 'hour';
  if (windowSeconds === 60) return 'minute';
  if (windowSeconds % 3600 === 0) return `${windowSeconds / 3600} hours`;
  if (windowSeconds % 60 === 0) return `${windowSeconds / 60} minutes`;
  return `${windowSeconds} seconds`;
}

export interface ToolExecution {
  ok: boolean;
  /** Tool name as the model sent it. Echoed for logging / UI correlation. */
  name: string;
  /** The validated args that actually reached the handler (if we got that far). */
  args?: unknown;
  /** Populated on success. */
  result?: ToolResult;
  /** Populated on any non-success path. */
  error?: ToolExecutionError;
}

/**
 * Execute a tool call end-to-end.
 *
 * Callers: the loop (Phase 2a) and the approval resumer (Phase 3b).
 *
 * Never throws — every failure mode produces a structured `ToolExecution`.
 * That's important because the loop has to feed the outcome back to the
 * model as a tool_result, which needs to be a string either way.
 */
export async function executeTool(
  name: string,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolExecution> {
  // 1. Early abort check — if the user already cancelled, don't start.
  if (ctx.signal.aborted) {
    return {
      ok: false,
      name,
      error: { code: 'aborted', message: 'Turn was cancelled before tool could run.' },
    };
  }

  // 2. Look up the tool. Model hallucinations land here.
  const tool = getTool(name);
  if (!tool) {
    logger.warn('[tools.execute] unknown tool requested', { name });
    return {
      ok: false,
      name,
      error: {
        code: 'unknown_tool',
        message: `No tool named "${name}" is available. Check the registered tool list.`,
      },
    };
  }

  // 3. Validate args. Prefer structured zod issues so the model can
  //    self-correct precisely ("expected number, got string at .limit").
  const parsed = tool.parameters.safeParse(rawArgs);
  if (!parsed.success) {
    const issueSummary = parsed.error.issues
      .slice(0, 6)
      .map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    return {
      ok: false,
      name,
      error: {
        code: 'invalid_args',
        message: `Arguments failed validation for "${name}":\n${issueSummary}`,
        issues: parsed.error.issues,
      },
    };
  }

  // 4. Per-tool rate limit. Bounds the blast radius of a single user's
  //    session even after the global /api/ai/task hourly cap has allowed
  //    the turn through — e.g., a model that tries to send 40 emails in
  //    one turn hits this before any of them go out. We scope the key by
  //    userId + tool.name so rate limits are per-tool, not shared across
  //    them.
  if (tool.rateLimit) {
    const { allowed } = await checkRateLimit(
      `ai:tool:${tool.name}:${ctx.userId}`,
      tool.rateLimit.max,
      tool.rateLimit.windowSeconds,
    );
    if (!allowed) {
      logger.warn('[tools.execute] rate limit hit', {
        tool: tool.name,
        userId: ctx.userId,
        max: tool.rateLimit.max,
        windowSeconds: tool.rateLimit.windowSeconds,
      });
      return {
        ok: false,
        name,
        args: parsed.data,
        error: {
          code: 'rate_limited',
          message: `Rate limit reached for "${tool.name}" (${tool.rateLimit.max} per ${formatWindow(tool.rateLimit.windowSeconds)}). Try again later.`,
        },
      };
    }
  }

  // 5. Run the handler inside a try/catch so an unexpected throw becomes
  //    a structured error rather than bubbling out of the loop.
  //    We emit one structured log line per execution (success or failure)
  //    so downstream aggregators can chart p95 duration + error rate per
  //    tool without any per-tool instrumentation.
  const startedAt = Date.now();
  try {
    const result = await (tool as ToolDefinition).handler(parsed.data, ctx);

    // A handler might honour the abort signal itself and return a zero-ish
    // result after cancellation; if the signal fired during execution,
    // surface that explicitly so the loop doesn't try to continue.
    if (ctx.signal.aborted) {
      logger.info('[tools.usage]', {
        tool: tool.name,
        userId: ctx.userId,
        spaceId: ctx.space.id,
        ok: false,
        errorCode: 'aborted',
        display: undefined,
        durationMs: Date.now() - startedAt,
      });
      return {
        ok: false,
        name,
        args: parsed.data,
        error: { code: 'aborted', message: 'Turn was cancelled while the tool was running.' },
      };
    }

    logger.info('[tools.usage]', {
      tool: tool.name,
      userId: ctx.userId,
      spaceId: ctx.space.id,
      ok: true,
      errorCode: undefined,
      display: result.display,
      durationMs: Date.now() - startedAt,
    });
    return { ok: true, name, args: parsed.data, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[tools.execute] handler threw', { name }, err);
    logger.info('[tools.usage]', {
      tool: tool.name,
      userId: ctx.userId,
      spaceId: ctx.space.id,
      ok: false,
      errorCode: 'handler_error',
      display: undefined,
      durationMs: Date.now() - startedAt,
    });
    return {
      ok: false,
      name,
      args: parsed.data,
      error: { code: 'handler_error', message },
    };
  }
}

/**
 * Convert a ToolExecution into a plain-text message the model can consume
 * as the `tool` role content. We give it a consistent shape so the model's
 * self-correction behaviour isn't derailed by formatting differences
 * between success and error paths.
 */
export function executionToModelMessage(exec: ToolExecution): string {
  if (exec.ok && exec.result) {
    return exec.result.summary;
  }
  if (exec.error) {
    return `ERROR (${exec.error.code}): ${exec.error.message}`;
  }
  return 'ERROR (unknown): the tool produced no result.';
}
