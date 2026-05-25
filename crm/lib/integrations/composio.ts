/**
 * Composio SDK wrapper. Single instance, env-gated, lazy-initialized.
 *
 * Why a wrapper, not direct SDK usage in routes: Composio is a vendor we
 * want to be able to swap. Every Composio touch goes through this file —
 * if we ever need to move (cost, reliability, feature gap), one file
 * changes and the rest of the codebase doesn't notice. Same invariant
 * we hold for the OpenAI Agents SDK behind `lib/ai-tools/sdk-bridge.ts`.
 *
 * Config:
 *   - COMPOSIO_API_KEY (required) — server-side only
 *   - COMPOSIO_REDIRECT_URL (optional) — where Composio sends the user
 *     after OAuth. Defaults to `${NEXT_PUBLIC_APP_URL}/integrations/callback`.
 */

import { Composio, type ConnectionRequest } from '@composio/core';
import { OpenAIAgentsProvider } from '@composio/openai-agents';
import { logger } from '@/lib/logger';

let _client: Composio<ReturnType<typeof makeProvider>['provider']> | null = null;

function makeProvider() {
  // Strict mode is the default — schemas are passed to the model verbatim
  // and the model must follow them exactly. Trade is slightly slower
  // responses for fewer malformed tool calls. For a CRM where the wrong
  // contactId is a real failure mode, strict wins.
  const provider = new OpenAIAgentsProvider({ strict: true });
  return { provider };
}

/**
 * Get the singleton Composio client. Throws if `COMPOSIO_API_KEY` is
 * missing — the caller should handle this gracefully (return 500 with
 * a realtor-friendly message, NOT show a stack trace).
 */
export function getComposio() {
  if (_client) return _client;
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY is not set');
  }
  const { provider } = makeProvider();
  _client = new Composio({ apiKey, provider });
  return _client;
}

/** True when the SDK is configured. UI uses this to hide the connect surface. */
export function composioConfigured(): boolean {
  return Boolean(process.env.COMPOSIO_API_KEY);
}

/**
 * Initiate a connection for a user against a toolkit. Returns the redirect
 * URL Composio expects the user to visit to complete OAuth, plus the
 * pending connection id we'll persist on callback.
 *
 * `entityId` should be the realtor's Clerk userId — Composio scopes
 * connections per "entity" so a future broker dashboard can list a
 * realtor's connected accounts cleanly.
 *
 * Composio's v3 SDK signature is `initiate(userId, authConfigId, options)` —
 * NOT `(userId, toolkit, options)`. We were passing the toolkit slug where
 * an `ac_…` id is expected, which made every connect attempt 502 even when
 * the realtor's Auth Configs were correctly set up in the Composio dashboard.
 * Fix: look up the realtor's Auth Config for the toolkit, then pass its
 * actual id to `initiate`.
 */
export async function initiateConnection(args: {
  entityId: string;
  toolkit: string;
  callbackUrl?: string;
}): Promise<ConnectionRequest> {
  const composio = getComposio();
  let authConfigId: string;
  try {
    const list = await composio.authConfigs.list({ toolkit: args.toolkit });
    const items = (list?.items ?? []) as Array<{ id: string }>;
    if (items.length === 0) {
      throw new Error(
        `No Auth Config exists for "${args.toolkit}". Open the Composio dashboard → Authentication management → Create Auth Config for ${args.toolkit}, then try again.`,
      );
    }
    // Take the first (or first composio-managed) auth config. Most realtors
    // will only ever have one per toolkit. If we surface multiples in the
    // future, the catalog can let them pick.
    authConfigId = items[0].id;
  } catch (err) {
    logger.error(
      '[integrations.composio] auth config lookup failed',
      { entityId: args.entityId, toolkit: args.toolkit },
      err,
    );
    throw err;
  }

  try {
    return await composio.connectedAccounts.initiate(args.entityId, authConfigId, {
      callbackUrl: args.callbackUrl,
    });
  } catch (err) {
    logger.error(
      '[integrations.composio] initiate failed',
      { entityId: args.entityId, toolkit: args.toolkit, authConfigId },
      err,
    );
    throw err;
  }
}

/** Look up a connected account by id (the one Composio returned at initiate). */
export async function getConnection(connectedAccountId: string) {
  const composio = getComposio();
  return composio.connectedAccounts.get(connectedAccountId);
}

/** Revoke + delete a connected account at Composio. Idempotent on our side. */
export async function deleteConnection(connectedAccountId: string): Promise<void> {
  const composio = getComposio();
  try {
    await composio.connectedAccounts.delete(connectedAccountId);
  } catch (err) {
    // Connection may already be gone on Composio's side — log + swallow.
    logger.warn(
      '[integrations.composio] delete failed (may be already gone)',
      { connectedAccountId },
      err,
    );
  }
}

/**
 * List the realtor's connected accounts on Composio's side. Used by the
 * /settings reconcile pass to discover connections that Composio knows
 * about but our DB doesn't (e.g. realtors who completed OAuth before
 * the connect-time persistence fix landed).
 *
 * Composio's `list` returns items with `id`, `toolkit.slug`, `status`,
 * `alias` (often the connected user's email), `createdAt`, `updatedAt`.
 * Filterable by `userIds`, `statuses`, `toolkitSlugs`.
 */
export async function listConnectedAccountsForEntity(args: {
  entityId: string;
  statuses?: ('INITIALIZING' | 'INITIATED' | 'ACTIVE' | 'FAILED' | 'EXPIRED' | 'INACTIVE')[];
}) {
  const composio = getComposio();
  return composio.connectedAccounts.list({
    userIds: [args.entityId],
    statuses: args.statuses ?? ['ACTIVE'],
  });
}

/**
 * Fetch the SDK Tool[] for a given user across the toolkits they have
 * connected. Returned tools drop straight into our SDK Agent's `tools`
 * array via the bridge — that's the whole point of the OpenAI Agents
 * provider above.
 */
export async function loadToolsForEntity(args: {
  entityId: string;
  toolkits: string[];
}) {
  if (args.toolkits.length === 0) return [];
  const composio = getComposio();
  // limit=1000 (server max) — without it, Composio's /api/v3/tools endpoint
  // defaults to 20 items per page and the SDK doesn't paginate. That cap
  // silently returns only the alphabetically-first 20 tools per toolkit,
  // which is why HubSpot looked like it only had archive/association
  // actions even after the realtor enabled 100+ slugs on the dashboard.
  return composio.tools.get(args.entityId, { toolkits: args.toolkits, limit: 1000 });
}

/**
 * Execute a single Composio tool by slug for a given user. Used by the
 * post-tour execute path, which fires approved proposals imperatively
 * (no model loop). The SDK does the auth, params shaping, and call.
 *
 * Returns the raw `ToolExecuteResponse`. Caller maps `successful`/`error`
 * onto our own ResultOut shape.
 */
export async function executeToolForEntity(args: {
  entityId: string;
  slug: string;
  arguments: Record<string, unknown>;
}) {
  const composio = getComposio();
  return composio.tools.execute(args.slug, {
    userId: args.entityId,
    arguments: args.arguments,
  });
}
