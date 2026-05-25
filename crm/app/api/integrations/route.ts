/**
 * GET /api/integrations
 *
 * List the realtor's connections — one row per (toolkit, status) the
 * settings panel renders. Status is the source of truth: 'active' rows
 * appear with a green dot, 'expired' / 'failed' surface a Reconnect
 * affordance, 'revoked' rows are filtered out (no UI noise).
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { listConnections, reconcileFromComposio } from '@/lib/integrations/connections';
import { composioConfigured } from '@/lib/integrations/composio';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const apiKeySet = composioConfigured();

  // Reconcile from Composio first — backfills any active connection that
  // Composio knows about but our DB doesn't (the recovery path for
  // realtors who completed OAuth on the previous codebase where the row
  // was only persisted in the callback, which was failing silently).
  // Best-effort: failures don't block the panel from loading.
  if (apiKeySet) {
    await reconcileFromComposio({ spaceId: space.id, entityId: userId });
  }

  const all = await listConnections(space.id);
  // Drop revoked rows — they're audit-only, not realtor-facing.
  const visible = all.filter((c) => c.status !== 'revoked');

  // Setup diagnostics — surfaced on the settings panel when something's
  // missing. The OAuth callback URL Composio redirects to is composed from
  // NEXT_PUBLIC_APP_URL (with APP_URL as fallback). Without either, the
  // callback URL is undefined, the realtor completes OAuth at the provider,
  // and Composio falls back to its own default — which doesn't land them
  // back in our app. Hardest bug to diagnose without an explicit warning.
  const appUrlSet = Boolean(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL);
  const setup = {
    apiKeySet,
    appUrlSet,
    callbackUrl: appUrlSet
      ? `${(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').replace(/\/$/, '')}/integrations/callback`
      : null,
  };

  return NextResponse.json({
    configured: apiKeySet,
    setup,
    connections: visible.map((c) => ({
      id: c.id,
      toolkit: c.toolkit,
      status: c.status,
      label: c.label,
      lastError: c.lastError,
      createdAt: c.createdAt,
    })),
  });
}
