import { supabase } from '@/lib/supabase';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { HOT_LEAD_THRESHOLD, WARM_LEAD_THRESHOLD } from '@/lib/constants';
import { Card, CardContent } from '@/components/ui/card';
import {
  PhoneIncoming,
  PhoneOutgoing,
  Briefcase,
  CheckCircle2,
  ArrowRight,
  Clock,
  AlertTriangle,
  Megaphone,
} from 'lucide-react';
import Link from 'next/link';
import type { Brokerage, BrokerageMembership } from '@/lib/types';

type MemberDashboardProps = {
  ctx: {
    brokerage: Brokerage;
    membership: BrokerageMembership;
    dbUserId: string;
  };
};

export async function MemberDashboard({ ctx }: MemberDashboardProps) {
  const { brokerage, dbUserId } = ctx;

  // Find the member's personal Space
  const { data: space } = await supabase
    .from('Space')
    .select('id, slug, name')
    .eq('ownerId', dbUserId)
    .maybeSingle();

  // Find the member's User record for the name
  const { data: userRow } = await supabase
    .from('User')
    .select('name, email')
    .eq('id', dbUserId)
    .maybeSingle();

  const userName = userRow?.name ?? userRow?.email ?? 'Realtor';

  if (!space) {
    return (
      <div className="space-y-6 w-full">
        <div className="rounded-xl bg-card border p-6">
          <h1 className="text-xl font-semibold">{`Welcome, ${userName}`}</h1>
          <p className="text-sm text-muted-foreground">{`${brokerage.name} \u00B7 Realtor`}</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
              <Briefcase size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Set up your workspace</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[280px] mx-auto">
              You need to complete your workspace setup before you can view your dashboard and start tracking leads.
            </p>
            <Link
              href="/setup"
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors mt-4"
            >
              Complete setup <ArrowRight size={12} />
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const spaceId = space.id;
  const spaceSlug = space.slug;

  // ── Fetch stats in parallel ──
  const now = new Date().toISOString();

  const [
    assignedLeadsRes,
    contactedLeadsRes,
    activeDealsRes,
    wonDealsRes,
    recentLeadsRes,
    overdueFollowUpsRes,
    announcementsRes,
  ] = await Promise.all([
    // Count leads assigned by broker
    spaceId
      ? supabase
          .from('Contact')
          .select('*', { count: 'exact', head: true })
          .eq('spaceId', spaceId)
          .contains('tags', ['assigned-by-broker'])
      : Promise.resolve({ count: 0 }),
    // Count contacted leads (lastContactedAt set)
    spaceId
      ? supabase
          .from('Contact')
          .select('*', { count: 'exact', head: true })
          .eq('spaceId', spaceId)
          .contains('tags', ['assigned-by-broker'])
          .not('lastContactedAt', 'is', null)
      : Promise.resolve({ count: 0 }),
    // Active deals
    spaceId
      ? supabase
          .from('Deal')
          .select('*', { count: 'exact', head: true })
          .eq('spaceId', spaceId)
          .eq('status', 'active')
      : Promise.resolve({ count: 0 }),
    // Won deals
    spaceId
      ? supabase
          .from('Deal')
          .select('*', { count: 'exact', head: true })
          .eq('spaceId', spaceId)
          .eq('status', 'won')
      : Promise.resolve({ count: 0 }),
    // Recent assigned leads (last 5)
    spaceId
      ? supabase
          .from('Contact')
          .select('id, name, phone, email, leadScore, scoreLabel, createdAt')
          .eq('spaceId', spaceId)
          .contains('tags', ['assigned-by-broker'])
          .order('createdAt', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
    // Overdue follow-ups
    spaceId
      ? supabase
          .from('Contact')
          .select('id, name, phone, email, followUpAt')
          .eq('spaceId', spaceId)
          .not('followUpAt', 'is', null)
          .lte('followUpAt', now)
          .order('followUpAt', { ascending: true })
          .limit(10)
      : Promise.resolve({ data: [] }),
    // Announcements from broker's space (Notes with title starting with [ANN])
    supabase
      .from('Note')
      .select('id, title, content, createdAt, spaceId')
      .ilike('title', '[ANN]%')
      .order('createdAt', { ascending: false })
      .limit(20),
  ]);

  const assignedCount = assignedLeadsRes.count ?? 0;
  const contactedCount = contactedLeadsRes.count ?? 0;
  const activeDealsCount = activeDealsRes.count ?? 0;
  const wonDealsCount = wonDealsRes.count ?? 0;

  const recentLeads = (recentLeadsRes.data ?? []) as Array<{
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    leadScore: number | null;
    scoreLabel: string | null;
    createdAt: string;
  }>;

  const overdueFollowUps = (overdueFollowUpsRes.data ?? []) as Array<{
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    followUpAt: string;
  }>;

  // Filter announcements — find broker's space IDs to only show brokerage-related notes
  // We look up spaces belonging to brokerage members with admin/owner roles
  const brokerMembers = await getBrokerageMembers(brokerage.id);
  const brokerSpaceIds = new Set(
    brokerMembers
      .filter((m) => m.role === 'broker_owner' || m.role === 'broker_admin')
      .map((m) => m.Space?.id)
      .filter(Boolean)
  );

  const announcements = ((announcementsRes.data ?? []) as Array<{
    id: string;
    title: string;
    content: string;
    createdAt: string;
    spaceId: string;
  }>)
    .filter((n) => brokerSpaceIds.has(n.spaceId))
    .slice(0, 3);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  function getScoreBadge(scoreLabel: string | null, leadScore: number | null) {
    if (!scoreLabel && leadScore == null) return null;
    const label = scoreLabel ?? `${leadScore}`;
    const color =
      scoreLabel === 'Hot' || (leadScore && leadScore >= HOT_LEAD_THRESHOLD)
        ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15'
        : scoreLabel === 'Warm' || (leadScore && leadScore >= WARM_LEAD_THRESHOLD)
          ? 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15'
          : 'text-muted-foreground bg-muted';
    return (
      <span className={`inline-flex items-center text-[10px] font-semibold rounded-full px-2 py-0.5 ${color}`}>
        {label}
      </span>
    );
  }

  return (
    <div className="space-y-6 w-full">
      {/* ── Welcome card ── */}
      <div className="rounded-xl bg-card border p-6">
        <h1 className="text-xl font-semibold">{`Welcome back, ${userName}`}</h1>
        <p className="text-sm text-muted-foreground">{`${brokerage.name} \u00B7 Realtor`}</p>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Leads assigned',
            value: assignedCount,
            icon: PhoneIncoming,
            color: assignedCount > 0 ? 'text-violet-600 dark:text-violet-400' : '',
            bg: 'bg-violet-500/10',
          },
          {
            label: 'Leads contacted',
            value: contactedCount,
            icon: PhoneOutgoing,
            color: contactedCount > 0 ? 'text-blue-600 dark:text-blue-400' : '',
            bg: 'bg-blue-500/10',
          },
          {
            label: 'Active deals',
            value: activeDealsCount,
            icon: Briefcase,
            color: activeDealsCount > 0 ? 'text-cyan-600 dark:text-cyan-400' : '',
            bg: 'bg-cyan-500/10',
          },
          {
            label: 'Deals closed',
            value: wonDealsCount,
            icon: CheckCircle2,
            color: wonDealsCount > 0 ? 'text-emerald-600 dark:text-emerald-400' : '',
            bg: 'bg-emerald-500/10',
          },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color ? bg : 'bg-muted'}`}>
                  <Icon size={16} className={color || 'text-muted-foreground'} />
                </div>
              </div>
              <p className={`text-2xl font-bold tabular-nums leading-tight ${color || 'text-foreground'}`}>
                {value}
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-tight">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Two-column layout: Recent leads + Overdue follow-ups ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent assigned leads */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Recent Assigned Leads</h2>
            <Link
              href="/broker/my-leads"
              className="text-xs text-primary font-medium hover:underline underline-offset-2 flex items-center gap-1"
            >
              View all <ArrowRight size={12} />
            </Link>
          </div>

          {recentLeads.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mx-auto mb-2">
                  <PhoneIncoming size={18} className="text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">No assigned leads yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[200px] mx-auto">
                  Leads assigned by your brokerage will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="divide-y divide-border">
                {recentLeads.map((lead) => (
                  <Link
                    key={lead.id}
                    href={spaceSlug ? `/s/${spaceSlug}/leads/${lead.id}` : '#'}
                    className="block"
                  >
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-primary">
                          {(lead.name ?? '?').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{lead.name}</p>
                          {getScoreBadge(lead.scoreLabel, lead.leadScore)}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {[lead.phone, lead.email].filter(Boolean).join(' \u00B7 ')}
                        </p>
                      </div>
                      <p className="text-[11px] text-muted-foreground flex-shrink-0">
                        {new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Overdue follow-ups */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Overdue Follow-ups</h2>

          {overdueFollowUps.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-sm font-medium text-foreground">All caught up</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[200px] mx-auto">
                  No overdue follow-ups right now. Nice work!
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="divide-y divide-border">
                {overdueFollowUps.map((contact) => {
                  const followUp = new Date(contact.followUpAt);
                  const isToday = followUp >= todayStart && followUp <= todayEnd;
                  const isOverdue = followUp < todayStart;

                  return (
                    <Link
                      key={contact.id}
                      href={spaceSlug ? `/s/${spaceSlug}/leads/${contact.id}` : '#'}
                      className="block"
                    >
                      <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isOverdue ? 'bg-red-50 dark:bg-red-500/10' : 'bg-amber-50 dark:bg-amber-500/10'}`}>
                          {isOverdue ? (
                            <AlertTriangle size={14} className="text-red-600 dark:text-red-400" />
                          ) : (
                            <Clock size={14} className="text-amber-600 dark:text-amber-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{contact.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[contact.phone, contact.email].filter(Boolean).join(' \u00B7 ')}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center text-[10px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0 ${
                            isOverdue
                              ? 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/15'
                              : 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15'
                          }`}
                        >
                          {isOverdue
                            ? `Overdue ${followUp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                            : 'Today'}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* ── Latest announcements ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Announcements</h2>
          <Link
            href="/broker/announcements"
            className="text-xs text-primary font-medium hover:underline underline-offset-2 flex items-center gap-1"
          >
            View all <ArrowRight size={12} />
          </Link>
        </div>

        {announcements.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mx-auto mb-2">
                <Megaphone size={18} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No announcements</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[200px] mx-auto">
                Announcements from your brokerage will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="divide-y divide-border">
              {announcements.map((note) => (
                <div key={note.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-foreground">
                      {note.title.replace(/^\[ANN\]\s*/, '')}
                    </p>
                    <p className="text-[11px] text-muted-foreground flex-shrink-0">
                      {new Date(note.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {note.content?.slice(0, 200)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
