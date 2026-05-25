/**
 * Type definitions for the on-demand agent's tool-use loop.
 *
 * A tool is:
 *   - named (short snake_case, surfaced to the model)
 *   - described (helps the model choose)
 *   - zod-validated on its arguments (both for the model's safety AND ours)
 *   - either auto-running (read-only) or permission-gated (mutations)
 *   - executed with a ToolContext that carries the caller's identity + space
 *
 * Read-only tools run immediately inside the loop. Mutating tools emit a
 * `permission_required` SSE event and pause until the user approves — see
 * lib/ai-tools/events.ts and phase 3.
 *
 * The contract is enforced at the type level, not by markdown:
 *   - `requiresApproval: true | 'maybe'` REQUIRES `summariseCall` and
 *     `rateLimit`. The realtor sees that summary in the prompt; without it
 *     they're approving an opaque verb. The rate limit is the blast-radius
 *     cap. Both are non-optional for any tool that mutates state.
 *   - `requiresApproval: false` makes both optional — read tools are cheap.
 *
 * Drift the types can't catch (snake_case, name uniqueness, description
 * length) is caught by `tests/lib/ai-tools-registry-contract.test.ts`,
 * which walks ALL_TOOLS at test time and asserts invariants. The test is
 * the spec.
 */

import type { z } from 'zod';

// ── Risk level for autonomous agent approval gating ───────────────────────

/**
 * Machine-readable risk classification for the autonomous orchestrator.
 *
 * - `safe`        — read-only; no side effects (find, search, get, list).
 * - `low`         — internal mutation; reversible (update contact, schedule follow-up).
 * - `high`        — external communication or user-visible side effect (send_email, send_sms).
 * - `destructive` — irreversible or high-impact action (archive, mark_lost, merge).
 */
export type RiskLevel = 'safe' | 'low' | 'high' | 'destructive';

// ── Context the loop passes to every handler ──────────────────────────────

/**
 * Passed into every tool handler. `space` is pre-resolved so the handler
 * doesn't need to do its own auth check — the loop resolves the caller's
 * space once per turn and uses it for all tool calls in that turn.
 */
export interface ToolContext {
  /** Clerk userId of the caller. */
  userId: string;
  /** The Chippi space the caller owns (or manages via broker role). */
  space: {
    id: string;
    slug: string;
    name: string;
    ownerId: string;
  };
  /** The AbortSignal for the current turn — handlers should respect it. */
  signal: AbortSignal;
}

// ── Tool result ───────────────────────────────────────────────────────────

/**
 * The model-facing result. `summary` is what the model sees; `data` is
 * structured output the UI can render without re-querying. `display` is a
 * hint for how to render the tool-call block ("contacts" → a small
 * contact-list card, etc.).
 */
export interface ToolResult<TData = unknown> {
  summary: string;
  data?: TData;
  /**
   * How the block renderer should tint this result.
   *
   * - `success`  → green: the mutation landed cleanly.
   * - `error`    → red:   the handler failed (but turn is still alive).
   * - `warning`  → amber: the tool finished but with an important caveat.
   * - `contacts` / `deals` / `tours` / `notes` / `plain` — neutral hints
   *   for rich inline cards.
   */
  display?:
    | 'contacts'
    | 'deals'
    | 'tours'
    | 'notes'
    | 'properties'
    | 'availability-picker'
    | 'plain'
    | 'success'
    | 'error'
    | 'warning';
}

// ── Tool definition ────────────────────────────────────────────────────────

export type ToolHandler<TArgs = unknown, TData = unknown> = (
  args: TArgs,
  ctx: ToolContext,
) => Promise<ToolResult<TData>>;

interface BaseToolFields<TArgs, TData> {
  /** Snake_case; exposed to the model. Must be unique across the registry. */
  name: string;
  /** One-sentence description for the model. */
  description: string;
  /** Zod schema for the arguments object. Runtime-validated before the handler runs. */
  parameters: z.ZodType<TArgs>;
  /** The actual work. Must respect ctx.signal for cancellation. */
  handler: ToolHandler<TArgs, TData>;
  /** Risk level for autonomous sweep approval gating. Defaults to 'safe'. */
  riskLevel?: RiskLevel;
}

/**
 * Read-only tool — runs without prompting. `summariseCall` and `rateLimit`
 * are optional because reads don't need a "what will happen if you approve?"
 * line and don't need a blast-radius cap (reads can't damage data).
 */
export interface ReadOnlyToolDefinition<TArgs = unknown, TData = unknown>
  extends BaseToolFields<TArgs, TData> {
  requiresApproval: false;
  summariseCall?: (args: TArgs) => string;
  rateLimit?: { max: number; windowSeconds: number };
}

/**
 * Mutating tool — pauses for user approval. `summariseCall` is REQUIRED so
 * the realtor sees what they're saying yes to. `rateLimit` is REQUIRED so
 * we cap blast radius even if the model goes wild.
 */
export interface MutatingToolDefinition<TArgs = unknown, TData = unknown>
  extends BaseToolFields<TArgs, TData> {
  requiresApproval: true | 'maybe';
  /** Resolver for `'maybe'` — inspect args and decide approval inline. */
  shouldApprove?: (args: TArgs, ctx: ToolContext) => boolean;
  /**
   * "What will happen if you approve?" Required because the realtor reads
   * this line in the PermissionPromptView. A generic "Run mark_person_hot"
   * is not acceptable — the contract is domain-specific.
   */
  summariseCall: (args: TArgs) => string;
  /**
   * Per-user rate limit. Required for mutators because the model can fire
   * tools in a loop and we cap the damage. `executeTool` checks this BEFORE
   * the handler runs.
   */
  rateLimit: { max: number; windowSeconds: number };
}

export type ToolDefinition<TArgs = unknown, TData = unknown> =
  | ReadOnlyToolDefinition<TArgs, TData>
  | MutatingToolDefinition<TArgs, TData>;

// ── Convenience builders ───────────────────────────────────────────────────

/**
 * Factory that preserves argument typing inside the handler so callers don't
 * have to annotate `args` themselves. The discriminated union enforces the
 * mutation/read split: TypeScript will refuse to compile a `requiresApproval:
 * true` tool that omits `summariseCall` or `rateLimit`.
 */
export function defineTool<TSchema extends z.ZodType, TData = unknown>(
  def:
    | (Omit<ReadOnlyToolDefinition<z.infer<TSchema>, TData>, 'parameters'> & {
        parameters: TSchema;
      })
    | (Omit<MutatingToolDefinition<z.infer<TSchema>, TData>, 'parameters'> & {
        parameters: TSchema;
      }),
): ToolDefinition<z.infer<TSchema>, TData> {
  return def as ToolDefinition<z.infer<TSchema>, TData>;
}

/**
 * Returns the declared risk level for a tool, or 'safe' if unset.
 * Use this in the orchestrator before deciding whether to gate execution.
 */
export function getRiskLevel(tool: ToolDefinition): RiskLevel {
  return tool.riskLevel ?? 'safe';
}
