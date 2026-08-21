/**
 * Type definitions for the on-demand agent's tool-use loop.
 *
 * A tool is:
 *   - named (short snake_case, surfaced to the model)
 *   - described (helps the model choose)
 *   - zod-validated on its arguments (both for the model's safety AND ours)
 *   - executed immediately — no human confirm, approval card, or
 *     "yes that's the move"
 *   - executed with a ToolContext that carries the caller's identity + space
 *
 * Every tool auto-executes. `execute.ts` and `registry.ts` do not pause
 * the turn for realtor sign-off. `requiresApproval: true` remains on the
 * type union so outbound send/draft tools owned by another agent still
 * typecheck; it is catalog metadata, not a pause gate.
 *
 * The contract is enforced at the type level, not by markdown:
 *   - `requiresApproval: true | 'maybe'` REQUIRES `summariseCall` and
 *     `rateLimit` (audit line + blast-radius cap).
 *   - `requiresApproval: false` makes both optional.
 *
 * Drift the types can't catch (snake_case, name uniqueness, description
 * length) is caught by `tests/lib/ai-tools-registry-contract.test.ts`,
 * which walks ALL_TOOLS at test time and asserts invariants. The test is
 * the spec.
 */

import type { z } from 'zod';

// ── Risk level for autonomous orchestrator classification ─────────────────

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
  /** Risk level for autonomous sweep classification. Defaults to 'safe'. */
  riskLevel?: RiskLevel;
}

/**
 * Auto-executing tool. `summariseCall` and `rateLimit` are optional —
 * reads don't need an audit line or a blast-radius cap.
 */
export interface ReadOnlyToolDefinition<TArgs = unknown, TData = unknown>
  extends BaseToolFields<TArgs, TData> {
  requiresApproval: false;
  summariseCall?: (args: TArgs) => string;
  rateLimit?: { max: number; windowSeconds: number };
}

/**
 * Mutating-shaped catalog entry. Kept so send/draft tools owned by
 * another agent still compile. The loop does not pause on this flag.
 * `summariseCall` is REQUIRED as an audit line. `rateLimit` is REQUIRED
 * so we cap blast radius even if the model goes wild.
 */
export interface MutatingToolDefinition<TArgs = unknown, TData = unknown>
  extends BaseToolFields<TArgs, TData> {
  requiresApproval: true | 'maybe';
  /** Unused by execute/registry — tools auto-execute. */
  shouldApprove?: (args: TArgs, ctx: ToolContext) => boolean;
  /**
   * Audit line for the tool call. Domain-specific — a generic
   * "Run mark_person_hot" is not acceptable.
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
 * have to annotate `args` themselves. The discriminated union still requires
 * `summariseCall` + `rateLimit` on any `requiresApproval: true` catalog
 * entry. The loop never pauses for those fields.
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
