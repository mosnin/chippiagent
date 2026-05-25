import { NextResponse, type NextRequest } from 'next/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────────────────────────

export type AuditActionFilter =
  | 'all'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'ACCESS'
  | 'LOGIN'
  | 'LOGOUT'
  | 'ADMIN_ACTION'
  | 'OFFBOARD';

const ACTION_VALUES: ReadonlyArray<Exclude<AuditActionFilter, 'all'>> = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'ACCESS',
  'LOGIN',
  'LOGOUT',
  'ADMIN_ACTION',
  'OFFBOARD',
];

export interface ActivityRow {
  id: string;
  clerkId: string | null;
  ipAddress: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  spaceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: {
    name: string | null;
    email: string | null;
  } | null;
  space: {
    slug: string | null;
  } | null;
}

export interface ActivityResponse {
  rows: ActivityRow[];
  nextCursor: string | null;
  actors: Record<string, { name: string | null; email: string | null }>;
  spaces: Record<string, { slug: string | null }>;
}

// Keep this list tight — it matches the set of actions the writer emits today.
// See lib/audit.ts AuditAction union. When a new action is added there, append
// it here and to the UI filter options. No dynamic list to avoid trusting
// client-supplied enum values.

const DEFAULT_SINCE_DAYS = 90;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type AuditLogRow = {
  id: string;
  clerkId: string | null;
  ipAddress: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  spaceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

/**
 * GET /api/broker/activity
 *
 * Returns the brokerage-scoped slice of the AuditLog table for compliance
 * review. Any broker-level member (broker_owner, broker_admin) can read.
 *
 * Query params:
 *   - action   : filter by single action verb, or 'all' (default)
 *   - actorClerkId : optional exact-match filter on Clerk user id
 *   - since    : ISO datetime lower bound (default: 90 days ago)
 *   - limit    : 1..500 (default: 100)
 *   - cursor   : ISO datetime; return rows strictly older than this value
 *
 * Response shape: { rows: ActivityRow[], nextCursor: string | null,
 *                   actors: map<clerkId, {name,email}>, spaces: map<id,{slug}> }
 *
 * Brokerage scoping:
 *   - Resolve spaceIds[] via Space.brokerageId = ctx.brokerage.id
 *   - Query A: AuditLog WHERE spaceId IN spaceIds
 *   - Query B: AuditLog WHERE spaceId IS NULL
 *              AND metadata->>'brokerageId' = ctx.brokerage.id
 *   - Merge + sort + limit. This avoids the easy-to-write leak where
 *     `.in('spaceId', ids).or('spaceId.is.null')` returns every brokerage's
 *     null-space rows to every caller.
 */
export async function GET(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);

  // ── Parse + validate query ────────────────────────────────────────────────
  const rawAction = url.searchParams.get('action');
  let actionFilter: AuditActionFilter = 'all';
  if (rawAction && rawAction !== 'all') {
    if (!ACTION_VALUES.includes(rawAction as Exclude<AuditActionFilter, 'all'>)) {
      return NextResponse.json({ error: 'Invalid action filter' }, { status: 400 });
    }
    actionFilter = rawAction as AuditActionFilter;
  }

  const actorClerkId = url.searchParams.get('actorClerkId');

  const defaultSince = new Date(
    Date.now() - DEFAULT_SINCE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const rawSince = url.searchParams.get('since');
  let sinceIso = defaultSince;
  if (rawSince) {
    const parsed = new Date(rawSince);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Invalid since timestamp' }, { status: 400 });
    }
    sinceIso = parsed.toISOString();
  }

  const rawLimit = url.searchParams.get('limit');
  let limit = DEFAULT_LIMIT;
  if (rawLimit) {
    const n = Number.parseInt(rawLimit, 10);
    if (!Number.isFinite(n) || n < 1 || n > MAX_LIMIT) {
      return NextResponse.json({ error: 'Invalid limit' }, { status: 400 });
    }
    limit = n;
  }

  // Compound cursor: "<createdAt ISO>|<row id>". Encoding a single ISO
  // timestamp alone was audit-flagged: PostgreSQL stores createdAt with
  // microsecond precision but JS serialises milliseconds, so rows that
  // share a millisecond boundary fell into (or out of) the cursor depending
  // on which side of the .lt() landed. Tupling createdAt + id lets us
  // evaluate "(createdAt, id) < (cursorTs, cursorId)" so ties are
  // deterministic and no row is dropped or duplicated.
  const rawCursor = url.searchParams.get('cursor');
  let cursorIso: string | null = null;
  let cursorId: string | null = null;
  if (rawCursor) {
    const [tsPart, idPart] = rawCursor.split('|');
    const parsed = new Date(tsPart ?? '');
    if (Number.isNaN(parsed.getTime()) || !idPart) {
      return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
    }
    cursorIso = parsed.toISOString();
    cursorId = idPart;
  }

  // ── Resolve brokerage spaces ──────────────────────────────────────────────
  const { data: spaceRows, error: spaceErr } = await supabase
    .from('Space')
    .select('id, slug')
    .eq('brokerageId', ctx.brokerage.id);
  if (spaceErr) {
    console.error('[broker/activity] space lookup failed', spaceErr);
    return NextResponse.json({ error: 'Failed to load activity' }, { status: 500 });
  }
  const spaces = (spaceRows ?? []) as Array<{ id: string; slug: string | null }>;
  const spaceIds = spaces.map((s) => s.id);

  // Over-fetch by 1 to detect whether another page exists.
  const pageSize = limit + 1;

  // ── Query A: space-scoped rows ────────────────────────────────────────────
  // If the brokerage owns zero spaces we skip query A entirely — `.in('spaceId',
  // [])` would return all rows in some supabase builds, which is the exact
  // cross-tenant leak we're trying to prevent.
  let spaceRowsResult: AuditLogRow[] = [];
  if (spaceIds.length > 0) {
    let q = supabase
      .from('AuditLog')
      .select('id, clerkId, ipAddress, action, resource, resourceId, spaceId, metadata, createdAt')
      .in('spaceId', spaceIds)
      .gte('createdAt', sinceIso)
      .order('createdAt', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize);
    if (actionFilter !== 'all') q = q.eq('action', actionFilter);
    if (actorClerkId) q = q.eq('clerkId', actorClerkId);
    if (cursorIso && cursorId) {
      // Tuple comparison via PostgREST .or(): (createdAt, id) < (ts, id).
      q = q.or(`createdAt.lt.${cursorIso},and(createdAt.eq.${cursorIso},id.lt.${cursorId})`);
    }
    const { data, error } = await q;
    if (error) {
      console.error('[broker/activity] space query failed', error);
      return NextResponse.json({ error: 'Failed to load activity' }, { status: 500 });
    }
    spaceRowsResult = (data ?? []) as AuditLogRow[];
  }

  // ── Query B: brokerage-wide null-space rows ───────────────────────────────
  // Match via metadata->>'brokerageId' — safe because it's a strict equality
  // filter tied to the caller's brokerage id. Rows that lack this metadata
  // field (older null-space rows, or system events with no tenant) stay
  // invisible here — that's a deliberate MVP tradeoff: better to hide a log
  // line than leak one.
  let nullSpaceResult: AuditLogRow[] = [];
  {
    let q = supabase
      .from('AuditLog')
      .select('id, clerkId, ipAddress, action, resource, resourceId, spaceId, metadata, createdAt')
      .is('spaceId', null)
      .eq('metadata->>brokerageId', ctx.brokerage.id)
      .gte('createdAt', sinceIso)
      .order('createdAt', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize);
    if (actionFilter !== 'all') q = q.eq('action', actionFilter);
    if (actorClerkId) q = q.eq('clerkId', actorClerkId);
    if (cursorIso && cursorId) {
      // Tuple comparison via PostgREST .or(): (createdAt, id) < (ts, id).
      q = q.or(`createdAt.lt.${cursorIso},and(createdAt.eq.${cursorIso},id.lt.${cursorId})`);
    }
    const { data, error } = await q;
    if (error) {
      // Non-fatal — we'd rather surface space rows than fail outright if the
      // jsonb operator path isn't indexed. Log and continue.
      console.error('[broker/activity] null-space query failed', error);
    } else {
      nullSpaceResult = (data ?? []) as AuditLogRow[];
    }
  }

  // ── Merge + sort + trim to page ───────────────────────────────────────────
  // Stable sort: createdAt desc, then id desc. Matches the per-query order.
  const merged = [...spaceRowsResult, ...nullSpaceResult].sort((a, b) => {
    const delta = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (delta !== 0) return delta;
    return b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
  });

  const hasMore = merged.length > limit;
  const pageRows = merged.slice(0, limit);
  const lastRow = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && lastRow ? `${lastRow.createdAt}|${lastRow.id}` : null;

  // ── Join actor names ──────────────────────────────────────────────────────
  const clerkIds = Array.from(
    new Set(pageRows.map((r) => r.clerkId).filter((v): v is string => !!v)),
  );
  const actorMap: Record<string, { name: string | null; email: string | null }> = {};
  if (clerkIds.length > 0) {
    const { data: users } = await supabase
      .from('User')
      .select('clerkId, name, email')
      .in('clerkId', clerkIds);
    for (const u of (users ?? []) as Array<{ clerkId: string; name: string | null; email: string | null }>) {
      actorMap[u.clerkId] = { name: u.name, email: u.email };
    }
  }

  // ── Build space slug map ──────────────────────────────────────────────────
  const spaceMap: Record<string, { slug: string | null }> = {};
  for (const s of spaces) spaceMap[s.id] = { slug: s.slug };

  // ── Enrich rows for response ──────────────────────────────────────────────
  const rows: ActivityRow[] = pageRows.map((r) => ({
    id: r.id,
    clerkId: r.clerkId,
    ipAddress: r.ipAddress,
    action: r.action,
    resource: r.resource,
    resourceId: r.resourceId,
    spaceId: r.spaceId,
    metadata: r.metadata,
    createdAt: r.createdAt,
    actor: r.clerkId ? actorMap[r.clerkId] ?? null : null,
    space: r.spaceId ? spaceMap[r.spaceId] ?? null : null,
  }));

  const body: ActivityResponse = {
    rows,
    nextCursor,
    actors: actorMap,
    spaces: spaceMap,
  };

  return NextResponse.json(body);
}
