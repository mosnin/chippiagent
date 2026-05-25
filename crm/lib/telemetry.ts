/**
 * Fire-and-forget telemetry emitter.
 *
 * Phase 2 product analytics: we need first-value events
 * (`signup_completed`, `chippi_first_message`, `agent_first_action_completed`)
 * so the team can measure time-from-signup-to-first-useful-agent-action.
 * Until those land every conversion hypothesis is fiction.
 *
 * Storage today is the `TelemetryEvent` Supabase table — no PostHog / Mixpanel
 * SDK is wired into the app and we don't want to take that dependency just to
 * ship telemetry. The team's analytics layer (Metabase / dbt / etc.) reads
 * this table directly. Future migration to a real provider is a swap of
 * `emit()`'s body; the signature stays the same so call sites don't move.
 *
 * Hard rules:
 *   - emit() NEVER throws — analytics must not break the user flow.
 *   - emit() failures log at warn and are dropped.
 *   - hasEmitted() returns false on error so we re-fire rather than silently
 *     skipping a real first-time event when Supabase blips.
 */
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export type TelemetryEventName =
  | 'signup_completed'
  | 'chippi_first_message'
  | 'agent_first_action_completed'
  // Per-tool-call observability for the chat agent. Payload carries the
  // tool name + reasoning sentence (the assistant text immediately
  // before the tool call) + the arg snapshot. Used to debug tool-pick
  // regressions and to feed the eval harness with real-traffic samples.
  | 'agent_tool_called';

export interface EmitArgs {
  event: TelemetryEventName;
  spaceId?: string | null;
  userId?: string | null;
  payload?: Record<string, unknown>;
}

/**
 * Insert one telemetry row. Awaitable so callers can `void emit(...)` to
 * detach explicitly, but callers SHOULD treat it as fire-and-forget — never
 * gate user-visible behavior on the result.
 */
export async function emit(args: EmitArgs): Promise<void> {
  try {
    const { error } = await supabase.from('TelemetryEvent').insert({
      id: crypto.randomUUID(),
      spaceId: args.spaceId ?? null,
      userId: args.userId ?? null,
      event: args.event,
      payload: args.payload ?? {},
    });
    if (error) {
      logger.warn('[telemetry] emit failed', { event: args.event }, error);
    }
  } catch (err) {
    logger.warn('[telemetry] emit threw', { event: args.event }, err);
  }
}

/**
 * Has this space already recorded a given first-time event? Used to gate
 * `chippi_first_message` and `agent_first_action_completed` so they fire
 * exactly once per space. Errors are swallowed and treated as "not emitted"
 * — a duplicate emit is cheaper than a missed first-value signal.
 */
export async function hasEmitted(
  spaceId: string,
  event: TelemetryEventName,
): Promise<boolean> {
  try {
    const { count, error } = await supabase
      .from('TelemetryEvent')
      .select('id', { count: 'exact', head: true })
      .eq('spaceId', spaceId)
      .eq('event', event)
      .limit(1);
    if (error) {
      logger.warn('[telemetry] hasEmitted failed', { event, spaceId }, error);
      return false;
    }
    return (count ?? 0) > 0;
  } catch (err) {
    logger.warn('[telemetry] hasEmitted threw', { event, spaceId }, err);
    return false;
  }
}

/**
 * Look up the timestamp of the first emitted row for a given event in this
 * space. Returns `null` if not found or on error. Used to compute
 * `secondsFromSignup` / `secondsFromFirstMessage` derived fields.
 */
export async function getFirstEmittedAt(
  spaceId: string,
  event: TelemetryEventName,
): Promise<Date | null> {
  try {
    const { data, error } = await supabase
      .from('TelemetryEvent')
      .select('createdAt')
      .eq('spaceId', spaceId)
      .eq('event', event)
      .order('createdAt', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { createdAt: string };
    const t = new Date(row.createdAt);
    return Number.isNaN(t.getTime()) ? null : t;
  } catch {
    return null;
  }
}

/** Whole seconds between two timestamps; null-safe. */
export function secondsBetween(from: Date | null, to: Date): number | null {
  if (!from) return null;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

/**
 * Tool names that produce a real side effect on the realtor's behalf —
 * a row was written, a message dispatched, a follow-up scheduled. A
 * successful call to one of these is what we count as the agent's "first
 * useful action" in the activation funnel.
 *
 * Covers both the Modal sandbox tool names (agent/tools/*.py) and the
 * legacy in-process tool names (lib/ai-tools/tools/*.ts) so the metric
 * works regardless of which path served the turn.
 *
 * Read-only tools (search_*, list_*, get_*, pipeline_summary,
 * delegate_to_subagent, recall_*) are intentionally excluded — they don't
 * represent the agent doing something for the user.
 */
export const SIDE_EFFECTING_TOOLS: ReadonlySet<string> = new Set([
  // Legacy in-process tools (lib/ai-tools/tools/*)
  'add_checklist_item',
  'advance_deal_stage',
  'move_deal_stage',
  'create_deal',
  'schedule_tour',
  'send_email',
  'send_sms',
  'update_contact',
  // Modal sandbox tools (agent/tools/*)
  'add_property',
  'create_draft_message',
  'send_or_draft',
  'update_contact_type',
  'update_contact_brief',
  'tag_contact',
  'mark_contact_warm',
  'update_deal_probability',
  'update_deal_notes',
  'set_contact_follow_up',
  'set_deal_follow_up',
  'create_goal',
  'update_goal_status',
  'record_outcome',
  // Forward-compat names referenced in the Phase 2 brief but not yet wired
  // — keeping them in the set means the moment they ship the metric works
  // without a code change here.
  'create_contact',
]);

/**
 * Gate-emit `agent_first_action_completed`. Called from the tool-result
 * sites; checks `hasEmitted` first so it fires exactly once per space.
 * Fire-and-forget — never blocks the turn.
 */
export async function maybeEmitFirstAction(input: {
  spaceId: string;
  userId?: string | null;
  toolName: string;
}): Promise<void> {
  const { spaceId, userId, toolName } = input;
  if (!SIDE_EFFECTING_TOOLS.has(toolName)) return;
  try {
    if (await hasEmitted(spaceId, 'agent_first_action_completed')) return;
    const [signupAt, firstMsgAt] = await Promise.all([
      getFirstEmittedAt(spaceId, 'signup_completed'),
      getFirstEmittedAt(spaceId, 'chippi_first_message'),
    ]);
    const now = new Date();
    await emit({
      event: 'agent_first_action_completed',
      spaceId,
      userId: userId ?? null,
      payload: {
        toolName,
        secondsFromSignup: secondsBetween(signupAt, now),
        secondsFromFirstMessage: secondsBetween(firstMsgAt, now),
      },
    });
  } catch (err) {
    logger.warn('[telemetry] maybeEmitFirstAction failed', { spaceId, toolName }, err);
  }
}
