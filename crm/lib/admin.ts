/**
 * Admin authorization — thin wrapper around lib/permissions.ts.
 *
 * Admin status is determined by User.platformRole = 'admin' in the DB.
 * Clerk publicMetadata.role = 'admin' is also accepted as a fallback so
 * admins set via the Clerk Dashboard before the migration continue to work.
 *
 * To grant admin access (either approach works):
 *   Option A — DB:    UPDATE "User" SET "platformRole" = 'admin' WHERE "clerkId" = '<id>';
 *   Option B — Clerk: Dashboard → Users → Metadata → { "role": "admin" }
 *
 * Every admin route, API endpoint, and server component must call
 * requireAdmin() before performing any privileged work.
 */

import { requirePlatformAdmin, isPlatformAdmin } from '@/lib/permissions';
import { audit } from '@/lib/audit';

export { isPlatformAdmin as checkAdmin };

export async function requireAdmin(): Promise<{ userId: string }> {
  const { clerkUserId } = await requirePlatformAdmin();
  return { userId: clerkUserId };
}

/**
 * Log an admin action for audit purposes.
 * Persists to the AuditLog table via supabase with resource='AdminAction'.
 */
export async function logAdminAction(params: {
  actor: string;
  action: string;
  target?: string;
  details?: Record<string, unknown>;
}) {
  await audit({
    actorClerkId: params.actor,
    action: 'ADMIN_ACTION',
    resource: 'AdminAction',
    resourceId: params.target,
    metadata: {
      adminAction: params.action,
      ...params.details,
    },
  });
}
