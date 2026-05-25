import { redirect } from 'next/navigation';
import { getBrokerMemberContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { AgentActivityClient, type RealtorRollup, type ResponseShape } from './agent-activity-client';

const DEFAULT_WINDOW_DAYS = 30;
const ROLLUP_LOG_CAP = 5000;

type Bucket =
  | 'tours'
  | 'stageMoves'
  | 'reviews'
  | 'drafts'
  | 'routedOut'
  | 'routedIn'
  | 'runs';

function bucketFor(actionType: string): Bucket {
  switch (actionType) {
    case 'tour_booked':         return 'tours';
    case 'deal_stage_advanced': return 'stageMoves';
    case 'review_requested':    return 'reviews';
    case 'message_drafted':
    case 'packet_drafted':      return 'drafts';
    case 'lead_routed_out':     return 'routedOut';
    case 'lead_routed_in':      return 'routedIn';
    default:                    return 'runs';
  }
}

function emptyTotals(): RealtorRollup['totals'] {
  return {
    all: 0, completed: 0, queued: 0, failed: 0,
    tours: 0, stageMoves: 0, reviews: 0, drafts: 0,
    routedOut: 0, routedIn: 0, runs: 0,
  };
}

// Compute the rollup directly here on the server — saves the API
// round-trip for the initial paint. The client refetches via
// /api/broker/agent-activity when the realtor changes the window.
async function rollupForBrokerage(brokerageId: string, windowDays: number): Promise<ResponseShape> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const generatedAt = new Date().toISOString();

  const { data: memberships } = await supabase
    .from('BrokerageMembership')
    .select('userId')
    .eq('brokerageId', brokerageId);
  const memberUserIds = (memberships ?? []).map((m) => m.userId as string);

  if (memberUserIds.length === 0) {
    return {
      windowDays,
      generatedAt,
      realtors: [],
      brokerage: { totals: emptyTotals(), realtorCount: 0 },
    };
  }

  const { data: spacesData } = await supabase
    .from('Space')
    .select('id, slug, ownerId')
    .in('ownerId', memberUserIds);
  const spaces = (spacesData ?? []) as Array<{ id: string; slug: string; ownerId: string }>;
  const spaceIds = spaces.map((s) => s.id);

  if (spaceIds.length === 0) {
    return {
      windowDays,
      generatedAt,
      realtors: [],
      brokerage: { totals: emptyTotals(), realtorCount: 0 },
    };
  }

  const { data: usersData } = await supabase
    .from('User')
    .select('id, name, email')
    .in('id', memberUserIds);
  const userById = new Map(
    ((usersData ?? []) as Array<{ id: string; name: string | null; email: string | null }>).map(
      (u) => [u.id, u],
    ),
  );

  const { data: logs } = await supabase
    .from('AgentActivityLog')
    .select('spaceId, actionType, outcome, createdAt')
    .in('spaceId', spaceIds)
    .gte('createdAt', since)
    .order('createdAt', { ascending: false })
    .limit(ROLLUP_LOG_CAP);

  const rollupBySpace = new Map<string, RealtorRollup>();
  for (const space of spaces) {
    const user = userById.get(space.ownerId);
    rollupBySpace.set(space.id, {
      userId: space.ownerId,
      name: user?.name ?? null,
      email: user?.email ?? null,
      spaceId: space.id,
      spaceSlug: space.slug,
      totals: emptyTotals(),
      lastActivityAt: null,
    });
  }

  const brokerageTotals = emptyTotals();

  for (const row of (logs ?? []) as Array<{
    spaceId: string;
    actionType: string;
    outcome: string;
    createdAt: string;
  }>) {
    const r = rollupBySpace.get(row.spaceId);
    if (!r) continue;

    r.totals.all += 1;
    brokerageTotals.all += 1;

    if (row.outcome === 'completed') { r.totals.completed += 1; brokerageTotals.completed += 1; }
    else if (row.outcome === 'queued_for_approval') { r.totals.queued += 1; brokerageTotals.queued += 1; }
    else if (row.outcome === 'failed') { r.totals.failed += 1; brokerageTotals.failed += 1; }

    const bucket = bucketFor(row.actionType);
    r.totals[bucket] += 1;
    brokerageTotals[bucket] += 1;

    if (!r.lastActivityAt || row.createdAt > r.lastActivityAt) {
      r.lastActivityAt = row.createdAt;
    }
  }

  const realtors = Array.from(rollupBySpace.values()).sort((a, b) => {
    if (b.totals.all !== a.totals.all) return b.totals.all - a.totals.all;
    const an = (a.name ?? a.email ?? '').toLowerCase();
    const bn = (b.name ?? b.email ?? '').toLowerCase();
    return an.localeCompare(bn);
  });

  return {
    windowDays,
    generatedAt,
    realtors,
    brokerage: { totals: brokerageTotals, realtorCount: realtors.length },
  };
}

export default async function BrokerAgentActivityPage() {
  const ctx = await getBrokerMemberContext();
  if (!ctx) redirect('/');

  const initial = await rollupForBrokerage(ctx.brokerage.id, DEFAULT_WINDOW_DAYS);

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      <header className="space-y-1.5">
        <p className="text-sm text-muted-foreground">Chippi.</p>
        <h1
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          What Chippi did
        </h1>
        <p className="text-sm text-muted-foreground">
          Across {ctx.brokerage.name}. Updates as your team works.
        </p>
      </header>

      <AgentActivityClient initial={initial} brokerageName={ctx.brokerage.name} />
    </div>
  );
}
