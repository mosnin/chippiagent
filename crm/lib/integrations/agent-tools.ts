/**
 * Bind a realtor's connected Composio toolkits as callable tools on the
 * Chippi chat agent.
 *
 * The story this closes — Musk lens: the realtor can already OAuth into
 * Facebook, LinkedIn, Slack, Twilio, etc. via Composio (the handshake
 * works, `IntegrationConnection` rows persist). But the agent loop had
 * zero awareness of those toolkits, so "post this on LinkedIn" went
 * nowhere. This module is the wire: connected toolkit → live agent tool.
 *
 * Why we DON'T use Composio's `OpenAIAgentsProvider` wrapping here:
 * the provider's `wrapTools` produces SDK tools with `needsApproval`
 * hard-OFF. A connected Twilio account would let the model fire an SMS
 * to a client with zero realtor confirmation. Unacceptable. So we fetch
 * the RAW Composio tool metadata (`getRawComposioTools`) and build each
 * SDK tool ourselves — which lets us set `needsApproval` per action.
 *
 * Each Composio action becomes one `tool()`:
 *   - name        — the action slug, lowercased (SDK name constraint).
 *   - description — Composio's own action description.
 *   - parameters  — Composio's `inputParameters` JSON schema, passed
 *                   through as a NON-strict schema (the model sees it
 *                   verbatim; Composio re-validates server-side anyway).
 *   - execute     — delegates to `executeToolForEntity`, the same path
 *                   the post-tour executor uses.
 *   - needsApproval — true for any action that posts/sends publicly, or
 *                   any action in a `social`/`messaging` toolkit. See
 *                   `actionNeedsApproval` for the discovery rule.
 *
 * Failure modes degrade to `[]` — a Composio outage must never take
 * down chat. The caller (`sdk-chat.ts`) owns the per-toolkit
 * reconcile-on-error loop; this module's `buildToolkitAgentTools` throws
 * the raw Composio error so that loop can attribute auth failures to the
 * right `IntegrationConnection` row.
 */

import { tool, type Tool as SdkTool } from '@openai/agents';
import { getComposio } from './composio';
import { activeToolkits } from './connections';
import { findIntegration } from './catalog';
import { logger } from '@/lib/logger';

/**
 * Composio's raw tool shape — the subset we touch. The SDK's full `Tool`
 * type carries more (tags, version, scopes); we only need these four.
 * `inputParameters` is a JSON Schema object Composio hands us directly.
 */
interface ComposioRawTool {
  slug: string;
  name?: string;
  description?: string;
  inputParameters?: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Action-name prefixes that mean "this action writes to the outside
 * world" — a post, a message, a publish. Any action whose slug contains
 * one of these segments is approval-gated regardless of its toolkit's
 * category. Matched case-insensitively against the slug.
 */
const PUBLIC_ACTION_SEGMENTS = ['post', 'send', 'publish', 'create_post', 'reply', 'comment', 'message', 'dm'];

/**
 * Toolkit categories whose actions are inherently public-facing — every
 * action gets approval-gated, not just the obvious posters. A `social`
 * or `messaging` toolkit reaching out on the realtor's behalf is always
 * something they should see before it happens.
 */
const ALWAYS_APPROVE_CATEGORIES = new Set(['social', 'messaging']);

/**
 * Decide whether a Composio action needs realtor approval before it
 * fires. Conservative by design: when in doubt, gate it. A false
 * positive costs one tap; a false negative posts to the realtor's
 * LinkedIn without consent.
 *
 *   - Toolkit category is `social` or `messaging` → always approve.
 *   - Action slug contains a public-action segment (post/send/publish/
 *     reply/comment/message/dm) → approve.
 *   - Everything else (reads, lookups, fetches) → no approval.
 */
export function actionNeedsApproval(actionSlug: string, toolkitSlug: string): boolean {
  const category = findIntegration(toolkitSlug)?.category;
  if (category && ALWAYS_APPROVE_CATEGORIES.has(category)) return true;
  const lower = actionSlug.toLowerCase();
  return PUBLIC_ACTION_SEGMENTS.some((seg) => lower.includes(seg));
}

/**
 * The SDK's tool `name` must match `^[a-zA-Z0-9_-]+$` and be ≤64 chars.
 * Composio slugs (e.g. `LINKEDIN_CREATE_LINKED_IN_POST`) already satisfy
 * the charset; we lowercase them so they read like the rest of Chippi's
 * snake_case catalog and truncate defensively at 64.
 */
function toSdkToolName(slug: string): string {
  return slug.toLowerCase().slice(0, 64);
}

/**
 * Wrap one raw Composio action as an SDK `tool()`. The handler closes
 * over `userId` (the Composio entity id) and the ORIGINAL action slug —
 * `executeToolForEntity` needs the slug exactly as Composio knows it,
 * not the lowercased SDK name.
 */
function buildOneTool(raw: ComposioRawTool, toolkitSlug: string, userId: string): SdkTool {
  const actionSlug = raw.slug;
  const needsApproval = actionNeedsApproval(actionSlug, toolkitSlug);

  // Composio's inputParameters is a JSON Schema object. Pass it through
  // as a non-strict schema: `strict: false` means the SDK does not
  // demand every property be `required`, which matches how Composio
  // actions actually work (most params are optional). Composio
  // re-validates the arguments server-side on `tools.execute`, so a
  // loose client-side schema is safe.
  const properties = raw.inputParameters?.properties ?? {};
  const required = raw.inputParameters?.required ?? [];
  const parameters = {
    type: 'object' as const,
    properties: properties as Record<string, Record<string, unknown>>,
    required,
    additionalProperties: true as const,
  };

  const description =
    raw.description?.trim() ||
    `${raw.name ?? actionSlug} — ${toolkitSlug} action available via the realtor's connected account.`;

  return tool({
    name: toSdkToolName(actionSlug),
    description,
    parameters,
    strict: false,
    needsApproval,
    async execute(input: unknown) {
      // Lazy import keeps this module loadable in unit tests that mock
      // the integrations layer without standing up the Composio client.
      const { executeToolForEntity } = await import('./composio');
      try {
        const result = await executeToolForEntity({
          entityId: userId,
          slug: actionSlug,
          arguments: (input as Record<string, unknown>) ?? {},
        });
        if (result.successful) {
          // The model reads this string. Keep the data compact — full
          // payloads bloat the context; the model rarely needs more
          // than "it worked" plus a small result echo.
          return JSON.stringify({ ok: true, data: result.data ?? {} });
        }
        return `Error: ${actionSlug} failed — ${result.error ?? 'unknown error'}`;
      } catch (err) {
        // A thrown error (network, auth) must not land as a raw stack in
        // the model's context. Reformat to the same `Error: ` prefix the
        // domain-tool bridge uses so the model continues gracefully.
        const message = err instanceof Error ? err.message : String(err);
        return `Error: ${actionSlug} failed — ${message}`;
      }
    },
  }) as SdkTool;
}

/**
 * Fetch and wrap every action for a single connected toolkit.
 *
 * Throws the raw Composio error on failure — the caller's per-toolkit
 * loop catches it, decides whether it's auth-shaped, and flips the
 * `IntegrationConnection` row to 'expired' if so. We do NOT swallow here:
 * swallowing would hide a dead connection from the reconcile path.
 *
 * `limit: 1000` mirrors `loadToolsForEntity` — without it Composio's
 * /tools endpoint returns only the first 20 actions per toolkit, which
 * silently truncates large toolkits like HubSpot.
 */
export async function buildToolkitAgentTools(args: {
  toolkit: string;
  userId: string;
}): Promise<SdkTool[]> {
  const composio = getComposio();
  const raw = (await composio.tools.getRawComposioTools({
    toolkits: [args.toolkit],
    limit: 1000,
  })) as ComposioRawTool[];
  return raw.map((t) => buildOneTool(t, args.toolkit, args.userId));
}

/**
 * Build the full Composio tool list for a realtor's chat turn.
 *
 * Reads the space's active `IntegrationConnection` rows, then fetches +
 * wraps each toolkit's actions. Per-toolkit isolation: a single dead
 * connection (auth-shaped error) is logged and dropped without poisoning
 * the rest of the batch. Empty connections → empty list, agent still
 * works on its native catalog.
 *
 * This is the public entry point `sdk-chat.ts`'s `buildChatAgent` awaits.
 */
export async function buildComposioAgentTools(
  spaceId: string,
  userId: string,
): Promise<SdkTool[]> {
  let toolkits: string[];
  try {
    toolkits = await activeToolkits({ spaceId, userId });
  } catch (err) {
    logger.warn('[integrations.agent-tools] activeToolkits lookup failed', {
      spaceId,
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  if (toolkits.length === 0) return [];

  const collected: SdkTool[] = [];
  for (const toolkit of toolkits) {
    try {
      const tools = await buildToolkitAgentTools({ toolkit, userId });
      collected.push(...tools);
    } catch (err) {
      // Re-throw is the caller's job; here we just log + skip so a
      // single sick toolkit doesn't deny the realtor every other tool.
      logger.warn('[integrations.agent-tools] toolkit tool build failed — skipping', {
        spaceId,
        userId,
        toolkit,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return collected;
}
