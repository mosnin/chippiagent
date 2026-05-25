import { getBrokerMemberContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { redirect } from 'next/navigation';
import {
  Building2,
  Briefcase,
  TrendingUp,
  Inbox,
  ChevronRight,
  ArrowRight,
  Mail,
  MessageCircle,
} from 'lucide-react';
import Link from 'next/link';
import { formatCompact } from '@/lib/formatting';
import { TeamActivityFeed } from '@/components/broker/team-activity-feed';
import { BrokerMorningStory } from '@/components/broker/broker-morning-story';
import { DraftImpactCard } from '@/components/broker/draft-impact-card';
import {
  aggregateDraftStats,
  draftStatsWindowStart,
  type DraftStatsRow,
} from '@/lib/draft-stats';
import { MemberDashboard } from './member-dashboard';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default async function BrokerOverviewPage() {
  const ctx = await getBrokerMemberContext();
  if (!ctx) redirect('/');

  // realtor_member sees their own work surface, not the swarm.
  if (ctx.membership.role === 'realtor_member') {
    return <MemberDashboard ctx={ctx} />;
  }

  const { brokerage } = ctx;
  const members = await getBrokerageMembers(ctx.brokerage.id, {
    includeOnboard: true,
    includeSpaceName: true,
  });

  const spaceIds = members.map((m) => m.Space?.id).filter(Boolean) as string[];

  // Make sure the broker owner's space is included — brokerage leads land
  // there before being routed.
  const { data: ownerSpaceRow } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', ctx.brokerage.ownerId)
    .maybeSingle();
  if (ownerSpaceRow?.id && !spaceIds.includes(ownerSpaceRow.id)) {
    spaceIds.push(ownerSpaceRow.id);
  }

  // Aggregate the swarm in one parallel volley. Each query is scoped to the
  // brokerage's set of spaces.
  const [
    applicationCountRes,
    leadCountRes,
    dealRows,
    wonDealRows,
    invitationsRes,
    draftRows,
    draftStatsRows,
  ] = await Promise.all([
      spaceIds.length > 0
        ? supabase
            .from('Contact')
            .select('*', { count: 'exact', head: true })
            .in('spaceId', spaceIds)
            .contains('tags', ['application-link'])
        : Promise.resolve({ count: 0 }),
      spaceIds.length > 0
        ? supabase
            .from('Contact')
            .select('*', { count: 'exact', head: true })
            .in('spaceId', spaceIds)
            .contains('tags', ['new-lead'])
        : Promise.resolve({ count: 0 }),
      spaceIds.length > 0
        ? supabase
            .from('Deal')
            .select('spaceId, value')
            .in('spaceId', spaceIds)
            .eq('status', 'active')
            .then((r) => r.data ?? [])
        : Promise.resolve([]),
      spaceIds.length > 0
        ? supabase
            .from('Deal')
            .select('spaceId, value')
            .in('spaceId', spaceIds)
            .eq('status', 'won')
            .then((r) => r.data ?? [])
        : Promise.resolve([]),
      supabase
        .from('Invitation')
        .select('id, email, roleToAssign, createdAt')
        .eq('brokerageId', brokerage.id)
        .eq('status', 'pending')
        .order('createdAt', { ascending: false })
        .limit(6),
      spaceIds.length > 0
        ? supabase
            .from('AgentDraft')
            .select('spaceId')
            .in('spaceId', spaceIds)
            .eq('status', 'pending')
            .then((r) => r.data ?? [])
        : Promise.resolve([]),
      // Decided drafts in the 30-day window — feeds the Draft impact card.
      // Same shape `aggregateDraftStats` expects; brokerage-wide rollup.
      spaceIds.length > 0
        ? supabase
            .from('AgentDraft')
            .select('feedback_action, edit_distance, decision_ms, outcome_signal')
            .in('spaceId', spaceIds)
            .not('feedback_action', 'is', null)
            .gte('createdAt', draftStatsWindowStart())
            .then((r) => r.data ?? [])
        : Promise.resolve([]),
    ]);

  const draftStats = aggregateDraftStats((draftStatsRows ?? []) as DraftStatsRow[]);

  const [applicationRows, leadRows] = await Promise.all([
    spaceIds.length > 0
      ? supabase
          .from('Contact')
          .select('spaceId')
          .in('spaceId', spaceIds)
          .contains('tags', ['application-link'])
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    spaceIds.length > 0
      ? supabase
          .from('Contact')
          .select('spaceId')
          .in('spaceId', spaceIds)
          .contains('tags', ['new-lead'])
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  const appsBySpace = (applicationRows as { spaceId: string }[]).reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.spaceId] = (acc[r.spaceId] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const leadsBySpace = (leadRows as { spaceId: string }[]).reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.spaceId] = (acc[r.spaceId] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const dealsBySpace = (dealRows as { spaceId: string; value: number | null }[]).reduce<
    Record<string, { count: number; value: number }>
  >((acc, r) => {
    if (!acc[r.spaceId]) acc[r.spaceId] = { count: 0, value: 0 };
    acc[r.spaceId].count += 1;
    acc[r.spaceId].value += r.value ?? 0;
    return acc;
  }, {});
  const draftsBySpace = (draftRows as { spaceId: string }[]).reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.spaceId] = (acc[r.spaceId] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const pendingInvitations = (invitationsRes.data ?? []) as Array<{
    id: string;
    email: string;
    roleToAssign: string;
    createdAt: string;
  }>;

  const activeMembers = members.filter((m) => m.User?.onboard).length;
  const totalApplications = applicationCountRes.count ?? 0;
  const totalLeads = leadCountRes.count ?? 0;
  const totalDeals = Object.values(dealsBySpace).reduce((a, b) => a + b.count, 0);
  const totalPipeline = Object.values(dealsBySpace).reduce((a, b) => a + b.value, 0);
  const totalWonValue = (wonDealRows as { spaceId: string; value: number | null }[]).reduce(
    (sum, d) => sum + (d.value ?? 0),
    0,
  );
  const totalPendingDrafts = Object.values(draftsBySpace).reduce((a, b) => a + b, 0);

  // Compose the morning status sentence the broker reads at the top.
  const statusSentence = (() => {
    if (activeMembers === 0) {
      return 'No realtors on the team yet — invite your first.';
    }
    const parts: string[] = [];
    parts.push(`${activeMembers} ${activeMembers === 1 ? 'realtor' : 'realtors'} on the team`);
    if (totalPendingDrafts > 0) {
      parts.push(`${totalPendingDrafts} draft${totalPendingDrafts === 1 ? '' : 's'} awaiting review`);
    }
    if (totalLeads > 0) {
      parts.push(`${totalLeads} new lead${totalLeads === 1 ? '' : 's'}`);
    }
    return parts.join(' · ') + '.';
  })();

  const hasSettings = !!(brokerage.name && (brokerage.logoUrl || brokerage.websiteUrl));

  // Sort members by current activity load (active drafts + new leads + active deals)
  // so the broker scans the busiest realtors first. Owner row stays pinned to top.
  const memberRows = members
    .map((m) => {
      const sId = m.Space?.id;
      const apps = sId ? appsBySpace[sId] ?? 0 : 0;
      const leads = sId ? leadsBySpace[sId] ?? 0 : 0;
      const deals = sId ? dealsBySpace[sId] ?? { count: 0, value: 0 } : { count: 0, value: 0 };
      const drafts = sId ? draftsBySpace[sId] ?? 0 : 0;
      return { member: m, apps, leads, deals, drafts };
    })
    .sort((a, b) => {
      // Owner first, then by drafts pending desc, then by deals desc
      if (a.member.role === 'broker_owner' && b.member.role !== 'broker_owner') return -1;
      if (b.member.role === 'broker_owner' && a.member.role !== 'broker_owner') return 1;
      if (a.drafts !== b.drafts) return b.drafts - a.drafts;
      return b.deals.count - a.deals.count;
    });

  return (
    <div className="max-w-5xl mx-auto space-y-12 pb-12">
      {/* Header — Chippi's morning sentence is the lead. The brokerage name
          and status counts step down into the supporting role they actually
          deserve: context, not headline. */}
      <header className="space-y-1.5">
        <p className="text-sm text-muted-foreground">{getGreeting()}.</p>
        <BrokerMorningStory />
        <p className="text-sm text-muted-foreground">
          {brokerage.name} &middot; {statusSentence}
        </p>
      </header>

      {/* First-run nudge — only when the brokerage hasn't been set up yet */}
      {!hasSettings && (
        <section className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 flex items-start gap-3">
          <MessageCircle size={14} className="text-orange-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-0.5">
            <p className="text-sm font-medium">Finish setting up your brokerage</p>
            <p className="text-[13px] text-muted-foreground">
              Add a logo, website, and intake form details so leads see a polished surface.
            </p>
          </div>
          <Link
            href="/broker/settings"
            className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline"
          >
            Open settings
            <ArrowRight size={12} />
          </Link>
        </section>
      )}

      {/* Snapshot — three numbers the broker actually cares about */}
      <section className="grid grid-cols-3 gap-px rounded-xl overflow-hidden border border-border/60 bg-border/60">
        <div className="bg-background px-4 py-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pipeline</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">
            ${formatCompact(totalPipeline)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {totalDeals} active deal{totalDeals === 1 ? '' : 's'}
          </p>
        </div>
        <div className="bg-background px-4 py-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Won</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">
            ${formatCompact(totalWonValue)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">closed this period</p>
        </div>
        <div className="bg-background px-4 py-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Funnel</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">
            {totalLeads}&nbsp;→&nbsp;{totalApplications}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">leads → applications</p>
        </div>
      </section>

      {/* Pending invitations — only when there are some */}
      {pendingInvitations.length > 0 && (
        <section>
          <div className="flex items-center gap-3 pb-3 border-b border-border/60">
            <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
              Pending invitations
            </h2>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {pendingInvitations.length}
            </span>
            <Link
              href="/broker/invitations"
              className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Manage
              <ArrowRight size={11} />
            </Link>
          </div>
          <ul className="divide-y divide-border/60">
            {pendingInvitations.map((inv) => {
              const role =
                inv.roleToAssign === 'broker_owner'
                  ? 'Owner'
                  : inv.roleToAssign === 'broker_admin'
                    ? 'Admin'
                    : 'Realtor';
              return (
                <li key={inv.id} className="py-3 flex items-center gap-3 text-sm">
                  <Mail size={13} className="text-muted-foreground flex-shrink-0" />
                  <span className="font-medium text-foreground truncate">{inv.email}</span>
                  <span className="text-xs text-muted-foreground">{role}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                    sent {new Date(inv.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* The swarm — your team today */}
      <section>
        <div className="flex items-center gap-3 pb-3 border-b border-border/60">
          <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
            Your team
          </h2>
          {activeMembers > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums">{activeMembers}</span>
          )}
          <Link
            href="/broker/members"
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Manage
            <ArrowRight size={11} />
          </Link>
        </div>

        {memberRows.length === 0 ? (
          <div className="py-8 text-sm text-muted-foreground">
            No realtors yet. Invite your first one to get started.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {memberRows.map(({ member, leads, deals, drafts, apps }) => {
              const name = member.User?.name ?? 'Unnamed realtor';
              const initial = name.charAt(0).toUpperCase();
              const space = member.Space;
              const href = space?.slug ? `/s/${space.slug}/chippi` : '#';
              const role =
                member.role === 'broker_owner'
                  ? 'Owner'
                  : member.role === 'broker_admin'
                    ? 'Admin'
                    : 'Realtor';
              const onboard = !!member.User?.onboard;
              return (
                <li key={member.id}>
                  <Link
                    href={href}
                    className="group/row flex items-center gap-3 py-3 -mx-2 px-2 rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-sm font-semibold text-muted-foreground">
                      {initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-foreground truncate">{name}</span>
                        <span className="text-[11px] text-muted-foreground">{role}</span>
                        {!onboard && (
                          <span className="text-[11px] text-amber-600 dark:text-amber-400">
                            invited — not joined
                          </span>
                        )}
                      </div>
                      <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                        {deals.count > 0 && (
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Briefcase size={10} />
                            {deals.count} deal{deals.count === 1 ? '' : 's'} · ${formatCompact(deals.value)}
                          </span>
                        )}
                        {apps > 0 && (
                          <span className="tabular-nums">
                            {apps} application{apps === 1 ? '' : 's'}
                          </span>
                        )}
                        {leads > 0 && (
                          <span className="tabular-nums">
                            {leads} new lead{leads === 1 ? '' : 's'}
                          </span>
                        )}
                        {drafts > 0 && (
                          <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 tabular-nums font-medium">
                            <Inbox size={10} />
                            {drafts} draft{drafts === 1 ? '' : 's'} pending
                          </span>
                        )}
                        {deals.count === 0 && apps === 0 && leads === 0 && drafts === 0 && onboard && (
                          <span>quiet — nothing in flight</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight
                      size={13}
                      className="flex-shrink-0 text-muted-foreground/0 group-hover/row:text-muted-foreground/60 transition-colors"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Draft impact — how Chippi's drafts have actually been landing across
          the brokerage over the last 30 days. Sits below the team list so the
          realtor row remains the focal element of the page. */}
      <DraftImpactCard stats={draftStats} />

      {/* What the team did — proof of work across the swarm */}
      <section>
        <div className="flex items-center gap-3 pb-3 border-b border-border/60">
          <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
            What the team did
          </h2>
          <TrendingUp size={11} className="text-muted-foreground" />
        </div>
        <div className="pt-4">
          <TeamActivityFeed />
        </div>
      </section>

      {/* Brokerage Chippi observations placeholder — surfaces in Phase 7b
          when the meta-agent lands. Keeps the visual real-estate so the
          shape lands now and the data fills in without a layout shift. */}
      <section className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-3.5 flex items-start gap-3">
        <Building2 size={14} className="text-muted-foreground flex-shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Brokerage Chippi is settling in</p>
          <p className="text-[13px] text-muted-foreground">
            Once the team has a few weeks of data, I&apos;ll start surfacing patterns here —
            who closes hottest in which neighborhood, where leads are getting stuck, who&apos;s
            ready for more volume.
          </p>
        </div>
      </section>
    </div>
  );
}
