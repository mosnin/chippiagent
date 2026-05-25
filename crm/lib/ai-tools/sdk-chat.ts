/**
 * TypeScript in-process chat runtime (fallback). Active when CHIPPI_CHAT_RUNTIME=ts.
 *
 * The primary runtime is Modal (agent/modal_app.py). This module is the fallback when
 * `CHIPPI_CHAT_RUNTIME=ts` is set. The flag default is `'modal'`, so this
 * code is dormant until explicitly activated — see `runtime-flag.ts`.
 *
 * Two entry points:
 *
 *   - `runChatTurn` — fresh user message. Builds the agent with all 42
 *     tools converted via `toSdkTool`, calls `run(agent, input, { stream:
 *     true })`, returns the SDK's stream + the result handle so the route
 *     can persist after the stream closes.
 *   - `resumeChatTurn` — load a paused run, apply the realtor's approval
 *     decision, continue the run from where it paused.
 *
 * What we do NOT do here:
 *   - SSE encoding. The route owns the wire format; this module returns
 *     SDK events and the route maps + frames them.
 *   - Persistence of paused runs. The route writes to `AgentPausedRun`
 *     after a paused run lands. Keeping persistence in the route lets the
 *     bridge stay pure and testable.
 */

import { Agent, run, type RunState, type Tool as SdkTool, type AgentInputItem } from '@openai/agents';
import {
  toSdkTool,
  restoreRunState,
  applyApprovalDecision,
  type ApprovalDecision,
} from './sdk-bridge';
import { buildPipelineAnalystAgent, buildContactResearcherAgent, buildPlannerAgent } from './sdk-skills';
import { buildSystemPrompt, buildPersonalizedSystemPrompt } from './system-prompt';
import { ALL_TOOLS } from './tools';
import type { ToolContext, ToolDefinition } from './types';
import { activeToolkits, markExpiredByToolkit } from '@/lib/integrations/connections';
import { composioConfigured } from '@/lib/integrations/composio';
import { buildToolkitAgentTools } from '@/lib/integrations/agent-tools';
import { logger } from '@/lib/logger';

// ── Config ─────────────────────────────────────────────────────────────────

/** Same model the bridge defaults to. Cheap enough to absorb chat traffic. */
const DEFAULT_MODEL = 'gpt-5-mini';

/**
 * Hard ceiling on tool-call iterations per chat turn. The SDK has its
 * own internal default; we set ours explicitly so a model that decides
 * to spelunk the catalog can't run our token bill into the ground. 15
 * gives the agent enough headroom to chain multi-step workflows
 * autonomously (look up a person → read their activity → find their
 * deal → draft a follow-up) without stopping mid-task to ask the
 * realtor a clarifying question.
 */
const MAX_TURNS_PER_TURN = 15;

// ── Agent construction ─────────────────────────────────────────────────────

/**
 * Build the chat agent. Public so the resume path can hand the same shape
 * to `restoreRunState` — the SDK requires the agent that originally
 * produced the state for deserialization.
 *
 * Optional `integrationTools` carry the Composio-loaded SDK tools for
 * whichever third-party apps the realtor has connected. Loaded dynamically
 * by `loadIntegrationTools` below; passed in here so this function stays
 * synchronous and pure for the resume path.
 */
export function buildChatAgent(
  ctx: ToolContext,
  opts: { model?: string; integrationTools?: SdkTool[]; instructions?: string } = {},
): Agent {
  const domainTools = ALL_TOOLS.map((t: ToolDefinition) => toSdkTool(t, ctx));

  // Sub-agent skills attached as tools via the SDK's native `Agent.asTool()`.
  const pipelineAnalyst = buildPipelineAnalystAgent(ctx, { model: opts.model });
  const contactResearcher = buildContactResearcherAgent(ctx, { model: opts.model });
  const planner = buildPlannerAgent(ctx, { model: opts.model });

  const skillTools = [
    pipelineAnalyst.asTool({
      toolName: 'analyze_pipeline',
      toolDescription:
        'Analyze the pipeline for stuck deals, quiet hot persons, and overdue follow-ups.',
    }),
    contactResearcher.asTool({
      toolName: 'research_person',
      toolDescription:
        'Research everything we know about a person and recommend the next action.',
    }),
    planner.asTool({
      toolName: 'planner',
      toolDescription:
        'Break a complex multi-step task into a concrete execution plan before starting work. Call this first when the user asks for something that requires several distinct actions.',
    }),
  ];

  // Personalized prompt is async — it loads a snapshot of the realtor's
  // pipeline + connected apps. Callers that already awaited it pass it
  // through `opts.instructions`. The fallback path uses the synchronous
  // static prompt so resume / tests / failure modes still work.
  return new Agent({
    name: 'Chippi',
    instructions: opts.instructions ?? buildSystemPrompt(ctx),
    tools: [...domainTools, ...skillTools, ...(opts.integrationTools ?? [])],
    model: opts.model ?? DEFAULT_MODEL,
  });
}

/**
 * Resolve the Composio tools the realtor's chat should see this turn.
 * Loaded fresh per request — connect/disconnect changes take effect on
 * the next message without any cache invalidation.
 *
 * The actual tool building lives in `lib/integrations/agent-tools.ts`:
 * each connected toolkit's Composio actions become approval-gated SDK
 * tools whose handlers delegate to `executeToolForEntity`. This function
 * owns the orchestration around it — the active-toolkit lookup and the
 * reconcile-on-error loop.
 *
 * Failure mode: if Composio is unconfigured, unreachable, or returns an
 * error, we log and proceed WITHOUT integration tools. The chat keeps
 * working on its native catalog. Hard-fail would mean a Composio outage
 * takes down all chat — wrong tradeoff.
 *
 * Reconcile-on-error: per-toolkit build so a single dead connection (the
 * realtor revoked our OAuth grant on the provider's side and our row is
 * still 'active') doesn't poison the entire batch. When the SDK throws a
 * `ComposioConnectedAccountNotFoundError` or an HTTP 401/403 on a
 * specific toolkit, we flip that row to 'expired' before continuing.
 * Next time the realtor opens /integrations, they see amber + Reconnect
 * — no toast, no surprise, just truth on the page.
 */
export async function loadIntegrationTools(ctx: ToolContext): Promise<SdkTool[]> {
  if (!composioConfigured()) return [];
  let toolkits: string[];
  try {
    toolkits = await activeToolkits({ spaceId: ctx.space.id, userId: ctx.userId });
  } catch (err) {
    logger.warn('[sdk-chat] activeToolkits lookup failed — proceeding without integration tools', {
      spaceId: ctx.space.id,
      userId: ctx.userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  if (toolkits.length === 0) return [];

  // Per-toolkit build lets us attribute auth failures to the right row.
  // The cost is N round-trips instead of 1, but N is bounded by how
  // many apps the realtor has connected (typically 2-5).
  const collected: SdkTool[] = [];
  for (const toolkit of toolkits) {
    try {
      const tools = await buildToolkitAgentTools({ toolkit, userId: ctx.userId });
      collected.push(...tools);
    } catch (err) {
      if (isAuthLikeError(err)) {
        // Don't await — keep the chat hot. The DB write is fire-and-
        // forget; worst case is the row stays 'active' for one more
        // turn and we do this dance again. Catch internal failures so
        // a Supabase blip doesn't bubble up here.
        void markExpiredByToolkit({
          spaceId: ctx.space.id,
          userId: ctx.userId,
          toolkit,
          error: err,
        }).catch((dbErr) => {
          logger.warn('[sdk-chat] markExpired failed', {
            toolkit,
            err: dbErr instanceof Error ? dbErr.message : String(dbErr),
          });
        });
        logger.warn('[sdk-chat] integration auth failed — row flipped to expired', {
          spaceId: ctx.space.id,
          userId: ctx.userId,
          toolkit,
          err: err instanceof Error ? err.message : String(err),
        });
      } else {
        logger.warn('[sdk-chat] integration tools load failed for toolkit — skipping', {
          spaceId: ctx.space.id,
          userId: ctx.userId,
          toolkit,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      // In all error cases, drop this toolkit's tools and keep going.
    }
  }
  return collected;
}

/**
 * Heuristic: is this error from Composio one we should treat as
 * "connection is dead, flip the row to expired"?
 *
 * We don't import the SDK error class to compare with `instanceof` —
 * the bridge keeps the SDK behind a thin wrapper, and a class compare
 * couples this file to a specific Composio version. Match by name and
 * by HTTP status code instead. Both are stable across SDK versions.
 *
 * Matched conditions:
 *   - `ComposioConnectedAccountNotFoundError` (the canonical "user
 *     revoked or never had this account")
 *   - HTTP 401 / 403 from Composio (auth refused at the provider)
 *   - error code starting with `CONNECTED_ACCOUNT_` (Composio's own
 *     code namespace for connected-account problems)
 *
 * Anything else (network errors, 5xx, validation errors) is treated
 * as transient and the row is left alone.
 */
export function isAuthLikeError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    name?: string;
    statusCode?: number;
    code?: string;
    cause?: { statusCode?: number };
  };
  if (e.name === 'ComposioConnectedAccountNotFoundError') return true;
  if (e.statusCode === 401 || e.statusCode === 403) return true;
  if (e.cause && (e.cause.statusCode === 401 || e.cause.statusCode === 403)) return true;
  if (typeof e.code === 'string' && e.code.startsWith('CONNECTED_ACCOUNT_')) return true;
  return false;
}

// ── Fresh-turn entry point ─────────────────────────────────────────────────

export interface ChatHistoryRow {
  role: 'user' | 'assistant';
  content: string;
}

export interface RunChatTurnInput {
  ctx: ToolContext;
  /**
   * The user's new message. Becomes the trailing item in the input array
   * we hand the SDK.
   */
  userMessage: string;
  /**
   * Prior turns from the same conversation, oldest first. Caller is
   * responsible for capping (the route uses HISTORY_LIMIT=20) and for
   * de-duping the just-saved user message before passing it in.
   *
   * The agent without history is the agent without memory of what the
   * realtor just said — every turn becomes a fresh start. Passing history
   * here is the difference between "Sam who?" and "right, Sam who you
   * mentioned two messages ago."
   */
  history?: ChatHistoryRow[];
  /**
   * Optional override for the model (tests, A/B). The default
   * `gpt-5-mini` matches the bridge.
   */
  model?: string;
}

/**
 * Start a fresh agent turn. Returns the SDK's streamed result so the
 * caller can iterate `result.toStream()` for events and await
 * `result.completed` to know when persistence is safe.
 */
export async function runChatTurn(input: RunChatTurnInput) {
  // Load integration tools and personalized instructions in parallel —
  // both are I/O-bound (Composio fetch + DB snapshot). The SDK's Agent
  // construction is synchronous so we await both before building.
  const [integrationTools, instructions] = await Promise.all([
    loadIntegrationTools(input.ctx),
    buildPersonalizedSystemPrompt(input.ctx),
  ]);
  const agent = buildChatAgent(input.ctx, {
    model: input.model,
    integrationTools,
    instructions,
  });

  // Build the SDK input as history + new user message. The SDK accepts
  // either a string OR an `AgentInputItem[]`; we use the array form so
  // the agent sees the conversation, not just the trailing turn.
  const items: AgentInputItem[] = [
    ...(input.history ?? []).map((row) => ({
      role: row.role,
      content: row.content,
    })),
    { role: 'user', content: input.userMessage },
  ] as unknown as AgentInputItem[];

  const result = await run(agent, items, {
    stream: true,
    signal: input.ctx.signal,
    maxTurns: MAX_TURNS_PER_TURN,
  });
  return { result, agent };
}

// ── Resume entry point ─────────────────────────────────────────────────────

export interface ResumeChatTurnInput {
  ctx: ToolContext;
  /** Serialized RunState from `AgentPausedRun.runState`. */
  serializedState: string;
  /** The realtor's decision for the pending approval. */
  decision: ApprovalDecision;
  /**
   * The SDK approval-item identifier we apply the decision to. The chat
   * route reads this from `AgentPausedRun.approvals[].callId` (or accepts
   * it on the resume request body for a multi-pending scenario).
   */
  callId: string;
  model?: string;
}

/**
 * Restore a paused run, apply the approval decision, and resume streaming.
 * Mirrors the fresh-turn return shape so the route can pump events the
 * same way regardless of which path produced them.
 */
export async function resumeChatTurn(input: ResumeChatTurnInput) {
  const [integrationTools, instructions] = await Promise.all([
    loadIntegrationTools(input.ctx),
    buildPersonalizedSystemPrompt(input.ctx),
  ]);
  const agent = buildChatAgent(input.ctx, {
    model: input.model,
    integrationTools,
    instructions,
  });
  const state = await restoreRunState(agent, input.serializedState);

  // Find the matching approval item on the rehydrated state. The SDK
  // exposes pending approvals via `state.getInterruptions()` in newer
  // versions, but to stay compatible we extract from a typed run helper
  // — which the bridge handles via `applyApprovalDecision`.
  const item = findInterruption(state, input.callId);
  if (!item) {
    throw new Error(`No pending approval matching callId=${input.callId}`);
  }
  applyApprovalDecision(state, item, input.decision);

  const result = await run(agent, state, {
    stream: true,
    signal: input.ctx.signal,
    maxTurns: MAX_TURNS_PER_TURN,
  });
  return { result, agent };
}

// ── Internals ──────────────────────────────────────────────────────────────

/**
 * Fish the matching approval item out of a rehydrated RunState. The SDK's
 * RunState exposes a `_currentStep` / interruptions accessor that varies
 * subtly across versions; we try the documented public surface first
 * (`getInterruptions()`), then fall back to scanning known internal arrays.
 *
 * If neither path finds anything, we return undefined and the caller
 * surfaces a clear error — this is the only failure mode a stale
 * approval ID can produce, and we'd rather fail loud than silently
 * resume without applying the decision.
 */
function findInterruption(
  state: RunState<unknown, Agent<unknown, 'text'>>,
  callId: string,
): Parameters<RunState<unknown, Agent<unknown, 'text'>>['approve']>[0] | undefined {
  const anyState = state as unknown as {
    getInterruptions?: () => Array<{ rawItem?: { callId?: string; id?: string } }>;
    _currentStep?: { interruptions?: Array<{ rawItem?: { callId?: string; id?: string } }> };
  };

  let pool: Array<{ rawItem?: { callId?: string; id?: string } }> = [];
  if (typeof anyState.getInterruptions === 'function') {
    pool = anyState.getInterruptions() ?? [];
  } else if (anyState._currentStep?.interruptions) {
    pool = anyState._currentStep.interruptions ?? [];
  }
  const found = pool.find((it) => {
    const id = it.rawItem?.callId ?? it.rawItem?.id;
    return id === callId;
  });
  return found as
    | Parameters<RunState<unknown, Agent<unknown, 'text'>>['approve']>[0]
    | undefined;
}
