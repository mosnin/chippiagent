import { redirect } from 'next/navigation';
import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { ActivityClient, type ActivityRow } from './activity-client';

// Server component: fetch the first page of AuditLog rows scoped to this
// brokerage, then hand off to the client for filter/pagination. Mirrors the
// pattern used by app/broker/reviews/page.tsx — use getBrokerContext (not
// requireBroker) so non-brokers get a clean redirect instead of a 500.
export default async function BrokerActivityPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  // 1. Resolve brokerage spaces.
  const { data: spaceRows } = await supabase
    .from('Space')
    .select('id, slug')
    .eq('brokerageId', ctx.brokerage.id);
  const spaces = (spaceRows ?? []) as Array<{ id: string; slug: string | null }>;
  const spaceIds = spaces.map((s) => s.id);
  const spaceMap: Record<string, { slug: string | null }> = {};
  for (const s of spaces) spaceMap[s.id] = { slug: s.slug };

  // 2. Pull the first page — most-recent 100 rows inside the 90-day window.
  //    Same two-query strategy as the API route: space-scoped + explicitly
  //    brokerage-tagged null-space rows, merged and trimmed. See the route
  //    comment for the leak vector this is avoiding.
  const sinceIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const PAGE = 100;

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

  let spaceScoped: AuditLogRow[] = [];
  if (spaceIds.length > 0) {
    const { data } = await supabase
      .from('AuditLog')
      .select('id, clerkId, ipAddress, action, resource, resourceId, spaceId, metadata, createdAt')
      .in('spaceId', spaceIds)
      .gte('createdAt', sinceIso)
      .order('createdAt', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE + 1);
    spaceScoped = (data ?? []) as AuditLogRow[];
  }

  let nullSpace: AuditLogRow[] = [];
  {
    const { data } = await supabase
      .from('AuditLog')
      .select('id, clerkId, ipAddress, action, resource, resourceId, spaceId, metadata, createdAt')
      .is('spaceId', null)
      .eq('metadata->>brokerageId', ctx.brokerage.id)
      .gte('createdAt', sinceIso)
      .order('createdAt', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE + 1);
    nullSpace = (data ?? []) as AuditLogRow[];
  }

  // Stable sort: createdAt desc, then id desc. Matches the route.
  const merged = [...spaceScoped, ...nullSpace].sort((a, b) => {
    const delta = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (delta !== 0) return delta;
    return b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
  });
  const hasMore = merged.length > PAGE;
  const pageRows = merged.slice(0, PAGE);
  const lastRow = pageRows[pageRows.length - 1];
  // Compound cursor (createdAt|id) — fixes the millisecond-tie bug the
  // audit flagged. Client treats this as an opaque string and echoes it
  // back on the next fetch.
  const nextCursor = hasMore && lastRow ? `${lastRow.createdAt}|${lastRow.id}` : null;

  // 3. Batch-load actor names for the rows we're about to render.
  const clerkIds = Array.from(
    new Set(pageRows.map((r) => r.clerkId).filter((v): v is string => !!v)),
  );
  const actorMap: Record<string, { name: string | null; email: string | null }> = {};
  if (clerkIds.length > 0) {
    const { data: users } = await supabase
      .from('User')
      .select('clerkId, name, email')
      .in('clerkId', clerkIds);
    for (const u of (users ?? []) as Array<{
      clerkId: string;
      name: string | null;
      email: string | null;
    }>) {
      actorMap[u.clerkId] = { name: u.name, email: u.email };
    }
  }

  const initialRows: ActivityRow[] = pageRows.map((r) => ({
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

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Activity log</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Everything your team has done in the CRM.
        </p>
      </div>
      <ActivityClient
        initialRows={initialRows}
        initialCursor={nextCursor}
        actors={actorMap}
        spaceMap={spaceMap}
        role={ctx.membership.role}
      />
    </div>
  );
}
