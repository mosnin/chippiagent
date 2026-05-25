/**
 * GET /api/integrations/health
 *
 * Returns live health status for every connection the calling user has in
 * this workspace. The integrations page fetches this client-side (non-
 * blocking) so it can show a colored dot per app without delaying the
 * initial render.
 *
 * Response shape:
 *   {
 *     connections: Array<{
 *       toolkit: string;
 *       name: string;
 *       status: 'healthy' | 'expired' | 'error' | 'disconnected';
 *       lastCheckedAt: string;   // ISO-8601
 *       error?: string;          // present when status is 'error' or 'expired'
 *     }>
 *   }
 *
 * Design decisions:
 *   - One Composio list call (userIds filter) rather than N individual
 *     get() calls — fewer round-trips, same data.
 *   - Per-connection errors are caught and mapped to 'error'; one bad
 *     Composio credential must not fail the whole response.
 *   - Revoked rows are excluded — they're audit-only and have no badge
 *     to display.
 *   - If Composio is not configured (no API key) we still return 200
 *     with the DB-derived statuses so the UI degrades gracefully.
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { listConnections } from '@/lib/integrations/connections';
import { getComposio, composioConfigured } from '@/lib/integrations/composio';
import { findIntegration } from '@/lib/integrations/catalog';
import { logger } from '@/lib/logger';

export type HealthStatus = 'healthy' | 'expired' | 'error' | 'disconnected';

export interface ConnectionHealth {
  toolkit: string;
  name: string;
  status: HealthStatus;
  lastCheckedAt: string;
  error?: string;
}

/**
 * Map a Composio connected-account status string to our four-state badge.
 * Composio statuses: INITIALIZING | INITIATED | ACTIVE | FAILED | EXPIRED | INACTIVE
 */
function mapComposioStatus(composioStatus: string): HealthStatus {
  switch (composioStatus) {
    case 'ACTIVE':
      return 'healthy';
    case 'EXPIRED':
      return 'expired';
    case 'FAILED':
      return 'error';
    case 'INACTIVE':
    case 'INITIALIZING':
    case 'INITIATED':
    default:
      return 'disconnected';
  }
}

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const checkedAt = new Date().toISOString();

  // Load all non-revoked DB rows for this space.
  const allRows = await listConnections(space.id);
  const rows = allRows.filter((r) => r.status !== 'revoked');

  if (rows.length === 0) {
    return NextResponse.json({ connections: [] });
  }

  // Build a lookup: composioConnectionId → DB status (fallback when
  // Composio is unavailable or the account isn't found in the list).
  const dbStatusByComposioId = new Map(
    rows.map((r) => [r.composioConnectionId, r.status]),
  );

  // Attempt a single Composio list call scoped to this user.
  // userId here is the Clerk userId which is the entityId we pass to Composio
  // (see composio.ts initiateConnection — entityId = Clerk userId).
  let composioByConnectionId = new Map<string, string>(); // composioConnectionId → Composio status string

  if (composioConfigured()) {
    try {
      const composio = getComposio();
      const result = await composio.connectedAccounts.list({
        userIds: [userId],
      });
      const items = result.items ?? [];
      for (const item of items) {
        // item.id is the Composio connected-account id which matches
        // what we stored as composioConnectionId in our DB.
        composioByConnectionId.set(item.id, item.status as string);
      }
    } catch (err) {
      // Composio unreachable — fall back to DB status for all connections.
      logger.warn(
        '[integrations/health] Composio list failed, falling back to DB status',
        { spaceId: space.id },
        err,
      );
    }
  }

  // Assemble the response: one entry per DB row, health sourced from
  // Composio if available, otherwise inferred from DB status.
  const connections: ConnectionHealth[] = rows.map((row) => {
    const integration = findIntegration(row.toolkit);
    const name = integration?.name ?? row.toolkit;

    // If Composio returned a status for this account, use it.
    const composioStatus = composioByConnectionId.get(row.composioConnectionId);

    let status: HealthStatus;
    let error: string | undefined;

    if (composioStatus !== undefined) {
      status = mapComposioStatus(composioStatus);
      // Surface the DB lastError when Composio reports expired/failed so
      // the UI can show something useful without a second request.
      if ((status === 'expired' || status === 'error') && row.lastError) {
        error = row.lastError;
      }
    } else {
      // Composio didn't return this account — either the list call failed,
      // or the account was deleted on Composio's side. Fall back to DB.
      switch (row.status) {
        case 'active':
          // Account exists in DB as active but Composio didn't list it —
          // treat as error (drift) rather than healthy (lying).
          status = composioConfigured() ? 'error' : 'healthy';
          break;
        case 'expired':
          status = 'expired';
          error = row.lastError ?? undefined;
          break;
        case 'failed':
          status = 'error';
          error = row.lastError ?? undefined;
          break;
        default:
          status = 'disconnected';
      }
    }

    return {
      toolkit: row.toolkit,
      name,
      status,
      lastCheckedAt: checkedAt,
      ...(error ? { error } : {}),
    };
  });

  return NextResponse.json({ connections });
}
