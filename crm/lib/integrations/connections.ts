/**
 * DB-side helpers for IntegrationConnection rows. The Composio SDK holds
 * the OAuth tokens; this table holds the pointer + status + audit. One
 * active row per (space, user, toolkit) — a reconnect flips the prior
 * row to 'revoked' and inserts a new 'active' row.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { deleteConnection as composioDelete, listConnectedAccountsForEntity } from './composio';
import { findIntegration } from './catalog';

export type IntegrationStatus = 'active' | 'expired' | 'revoked' | 'failed';

export interface IntegrationConnectionRow {
  id: string;
  spaceId: string;
  userId: string;
  toolkit: string;
  composioConnectionId: string;
  status: IntegrationStatus;
  label: string | null;
  lastError: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Best-effort reconcile from Composio → our DB. Pulls every active
 * connection Composio has for this user and upserts any our DB doesn't
 * know about. Recovery path for realtors who completed OAuth on the
 * old broken codebase (where the row was only persisted in the callback,
 * which was failing silently). Idempotent; safe to call on every
 * /settings load.
 *
 * Failures are swallowed (logged, not thrown) — a Composio outage should
 * not break the integrations panel from loading.
 */
export async function reconcileFromComposio(args: {
  spaceId: string;
  entityId: string;
}): Promise<void> {
  let list;
  try {
    list = await listConnectedAccountsForEntity({ entityId: args.entityId });
  } catch (err) {
    logger.warn('[integrations.connections] reconcile composio list failed', {
      entityId: args.entityId,
      err: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const items = ((list as { items?: unknown[] })?.items ?? []) as Array<{
    id?: string;
    status?: string;
    alias?: string | null;
    toolkit?: { slug?: string } | null;
  }>;

  for (const item of items) {
    if (!item.id || !item.toolkit?.slug) continue;
    if (item.status !== 'ACTIVE') continue;
    if (!findIntegration(item.toolkit.slug)) continue;

    const existing = await findByComposioId(item.id);
    if (existing) continue; // already tracked, skip

    // Composio has it, we don't — backfill.
    const inserted = await insertConnection({
      spaceId: args.spaceId,
      userId: args.entityId,
      toolkit: item.toolkit.slug,
      composioConnectionId: item.id,
      label: item.alias ?? undefined,
    });
    if (inserted) {
      logger.info('[integrations.connections] reconciled composio connection into DB', {
        composioConnectionId: item.id,
        toolkit: item.toolkit.slug,
        spaceId: args.spaceId,
      });
    }
  }
}

/** All connections for a space, regardless of status. UI filters as needed. */
export async function listConnections(spaceId: string): Promise<IntegrationConnectionRow[]> {
  const { data, error } = await supabase
    .from('IntegrationConnection')
    .select('*')
    .eq('spaceId', spaceId)
    .order('createdAt', { ascending: false });
  if (error) {
    logger.warn('[integrations.connections] list failed', { spaceId, err: error.message });
    return [];
  }
  return (data ?? []) as IntegrationConnectionRow[];
}

/** Active toolkit slugs for a given (space, user) — the chat agent reads this
 *  on every turn to decide which Composio tools to load. Hot path; keep tight. */
export async function activeToolkits(args: {
  spaceId: string;
  userId: string;
}): Promise<string[]> {
  const { data, error } = await supabase
    .from('IntegrationConnection')
    .select('toolkit')
    .eq('spaceId', args.spaceId)
    .eq('userId', args.userId)
    .eq('status', 'active');
  if (error) {
    logger.warn('[integrations.connections] activeToolkits failed', {
      spaceId: args.spaceId,
      err: error.message,
    });
    return [];
  }
  return ((data ?? []) as Array<{ toolkit: string }>).map((r) => r.toolkit);
}

/** Look up by composio connection id — used by the OAuth callback. */
export async function findByComposioId(composioConnectionId: string) {
  const { data } = await supabase
    .from('IntegrationConnection')
    .select('*')
    .eq('composioConnectionId', composioConnectionId)
    .maybeSingle();
  return (data ?? null) as IntegrationConnectionRow | null;
}

/** Look up by our own row id. */
export async function getById(id: string) {
  const { data } = await supabase
    .from('IntegrationConnection')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return (data ?? null) as IntegrationConnectionRow | null;
}

/**
 * Upsert by `composioConnectionId`. Used by the OAuth callback now that
 * the connect-route persists the row at initiate-time. If the row exists,
 * update its label (Composio surfaces the connected user's email after
 * OAuth completes) and bump status back to 'active' if it had drifted.
 * If it doesn't exist (callback ran but connect-route didn't persist for
 * some reason — defensive), insert it.
 */
export async function upsertByComposioId(args: {
  spaceId: string;
  userId: string;
  toolkit: string;
  composioConnectionId: string;
  label?: string;
}): Promise<IntegrationConnectionRow | null> {
  const existing = await findByComposioId(args.composioConnectionId);
  if (existing) {
    const { error } = await supabase
      .from('IntegrationConnection')
      .update({
        label: args.label ?? existing.label ?? null,
        status: 'active',
        lastError: null,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) {
      logger.error('[integrations.connections] upsertByComposioId update failed', {
        id: existing.id,
        errCode: (error as { code?: string }).code ?? null,
        errMessage: error.message,
        errDetails: (error as { details?: string }).details ?? null,
      });
      return null;
    }
    return { ...existing, label: args.label ?? existing.label ?? null, status: 'active', lastError: null };
  }
  return insertConnection(args);
}

/**
 * Insert a new connection row. Caller is responsible for revoking any
 * prior active row for the same (space, user, toolkit) BEFORE calling
 * this — the unique-active index will reject otherwise.
 */
export async function insertConnection(args: {
  spaceId: string;
  userId: string;
  toolkit: string;
  composioConnectionId: string;
  label?: string;
}): Promise<IntegrationConnectionRow | null> {
  const { data, error } = await supabase
    .from('IntegrationConnection')
    .insert({
      spaceId: args.spaceId,
      userId: args.userId,
      toolkit: args.toolkit,
      composioConnectionId: args.composioConnectionId,
      label: args.label ?? null,
      status: 'active',
    })
    .select('*')
    .single();
  if (error) {
    // Log the full error shape — code, details, hint — so post-mortem can
    // tell apart a unique-constraint clash from an RLS rejection from a
    // missing column. The previous version logged only `error.message`,
    // which Supabase often returns as a generic "duplicate key value" or
    // "permission denied" without enough context to fix.
    logger.error('[integrations.connections] insert failed', {
      spaceId: args.spaceId,
      userId: args.userId,
      toolkit: args.toolkit,
      composioConnectionId: args.composioConnectionId,
      hasLabel: Boolean(args.label),
      errCode: (error as { code?: string }).code ?? null,
      errMessage: error.message,
      errDetails: (error as { details?: string }).details ?? null,
      errHint: (error as { hint?: string }).hint ?? null,
    });
    return null;
  }
  return data as IntegrationConnectionRow;
}

/** Flip a row's status. Used for reconnect (prior → revoked) and on errors. */
export async function setStatus(args: {
  id: string;
  status: IntegrationStatus;
  lastError?: string;
}): Promise<void> {
  const { error } = await supabase
    .from('IntegrationConnection')
    .update({
      status: args.status,
      lastError: args.lastError ?? null,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', args.id);
  if (error) {
    logger.warn('[integrations.connections] setStatus failed', { id: args.id, err: error.message });
  }
}

/** Revoke at Composio AND mark our row revoked. Idempotent. */
export async function revoke(row: IntegrationConnectionRow): Promise<void> {
  await composioDelete(row.composioConnectionId);
  await setStatus({ id: row.id, status: 'revoked' });
}

/**
 * Flip the row matching this Composio connection id to 'expired'. Used by
 * the chat agent when the SDK reports the connected account is gone or
 * unauthorized — typically because the realtor revoked our OAuth grant on
 * the provider's side. Reflects truth on the integrations panel (amber
 * dot + "Reconnect") the moment we discover the drift; no toast, no
 * notification, just the page being honest the next time they look.
 *
 * Idempotent: a no-op if no row matches (the connection may have been
 * deleted on our side already).
 */
export async function markExpiredByComposioId(
  composioConnectionId: string,
  error: unknown,
): Promise<void> {
  const row = await findByComposioId(composioConnectionId);
  if (!row) return;
  // Don't downgrade an already-revoked or already-expired row — the
  // realtor's already seen the truth, and a chat-time write would be
  // pure churn.
  if (row.status === 'revoked' || row.status === 'expired') return;
  const message = error instanceof Error ? error.message : String(error);
  await setStatus({ id: row.id, status: 'expired', lastError: message });
  logger.info('[integrations.connections] marked expired from chat', {
    id: row.id,
    composioConnectionId,
    err: message,
  });
}

/**
 * Same as `markExpiredByComposioId` but keyed by (space, user, toolkit) —
 * the chat agent's catch path knows the toolkit it tried to load tools
 * for, but not necessarily the Composio connected-account id (the SDK
 * doesn't always surface it on the error). Idempotent.
 */
export async function markExpiredByToolkit(args: {
  spaceId: string;
  userId: string;
  toolkit: string;
  error: unknown;
}): Promise<void> {
  const row = await findActive({
    spaceId: args.spaceId,
    userId: args.userId,
    toolkit: args.toolkit,
  });
  if (!row) return;
  const message = args.error instanceof Error ? args.error.message : String(args.error);
  await setStatus({ id: row.id, status: 'expired', lastError: message });
  logger.info('[integrations.connections] marked expired from chat', {
    id: row.id,
    toolkit: args.toolkit,
    err: message,
  });
}

/** Find any active row for this (space, user, toolkit). Helper for callback. */
export async function findActive(args: {
  spaceId: string;
  userId: string;
  toolkit: string;
}): Promise<IntegrationConnectionRow | null> {
  const { data } = await supabase
    .from('IntegrationConnection')
    .select('*')
    .eq('spaceId', args.spaceId)
    .eq('userId', args.userId)
    .eq('toolkit', args.toolkit)
    .eq('status', 'active')
    .maybeSingle();
  return (data ?? null) as IntegrationConnectionRow | null;
}
