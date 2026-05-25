/**
 * Helpers to build a ToolContext for the loop.
 *
 * Centralised so we never have a tool handler doing its own auth check — if
 * the loop's resolveToolContext passes, every handler is already authorized
 * against `ctx.space`. Handlers filter queries by `ctx.space.id`.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import type { ToolContext } from './types';

/**
 * Resolve the calling user's Clerk id and the space they're operating in for
 * this turn. We accept `spaceSlug` rather than inferring so brokers managing
 * multiple spaces can route turns to a specific space.
 *
 * Returns either a ToolContext (caller owns / manages the space) or a 4xx
 * NextResponse the caller can propagate out of the HTTP handler.
 */
export async function resolveToolContext(
  spaceSlug: string,
  signal: AbortSignal,
): Promise<ToolContext | NextResponse> {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // Look up the internal user id to scope the space check.
  const { data: userRow } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', userId)
    .maybeSingle();
  if (!userRow) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { data: space } = await supabase
    .from('Space')
    .select('id, slug, name, ownerId')
    .eq('slug', spaceSlug)
    .maybeSingle();
  if (!space) {
    return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  }

  // Owner access: direct ownership is the common case. Broker-admin access
  // could be layered on here later — intentionally starting strict so the
  // on-demand agent never acts outside the caller's own space.
  if (space.ownerId !== userRow.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return {
    userId,
    space: {
      id: space.id,
      slug: space.slug,
      name: space.name,
      ownerId: space.ownerId,
    },
    signal,
  };
}
