import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { formatCompact } from '@/lib/formatting';
import Link from 'next/link';
import {
  ArrowLeft,
  PhoneIncoming,
  Briefcase,
  TrendingUp,
  Users,
  CheckCircle2,
  AlertCircle,
  Flame,
  Calendar,
  Mail as MailIcon,
  Phone,
} from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Realtor Detail — Broker Dashboard' };

type Params = { params: Promise<{ userId: string }> };

export default async function RealtorDrilldownPage({ params }: Params) {
  const { userId } = await params;
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  // Verify membership
  const { data: membership } = await supabase
    .from('BrokerageMembership')
    .select('id, role, createdAt')
    .eq('brokerageId', ctx.brokerage.id)
    .eq('userId', userId)
    .maybeSingle();

  if (!membership) redirect('/broker/realtors');

  // Get user + space
  const { data: user } = await supabase
    .from('User')
    .select('id, name, email, onboard')
    .eq('id', userId)
    .maybeSingle();

  if (!user) redirect('/broker/realtors');

  const { data: space } = await supabase
    .from('Space')
    .select('id, slug, name')
    .eq('ownerId', userId)
    .maybeSingle();

  // Fetch data in parallel — display rows are limited, but counts are separate
  const spaceId = space?.id;
  const [contactsRes, dealsRes, stagesRes, contactCountRes, newLeadCountRes, hotLeadCountRes, dealCountRes] = await Promise.all([
    spaceId
      ? supabase
          .from('Contact')
          .select('id, name, email, phone, type, tags, leadScore, scoreLabel, followUpAt, createdAt')
          .eq('spaceId', spaceId)
          .order('createdAt', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    spaceId
      ? supabase
          .from('Deal')
          .select('id, title, value, status, stageId, closeDate, createdAt')
          .eq('spaceId', spaceId)
          .order('createdAt', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    spaceId
      ? supabase
          .from('DealStage')
          .select('id, name, color, position')
          .eq('spaceId', spaceId)
          .order('position', { ascending: true })
      : Promise.resolve({ data: [] }),
    // Accurate counts (head-only queries)
    spaceId
      ? supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', spaceId)
      : Promise.resolve({ count: 0 }),
    spaceId
      ? supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', spaceId).contains('tags', ['new-lead'])
      : Promise.resolve({ count: 0 }),
    spaceId
      ? supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', spaceId).eq('scoreLabel', 'hot')
      : Promise.resolve({ count: 0 }),
    spaceId
      ? supabase.from('Deal').select('id, value, status').eq('spaceId', spaceId).limit(10000)
      : Promise.resolve({ data: [] }),
  ]);

  const contacts = (contactsRes.data ?? []) as Array<{
    id: string; name: string; email: string | null; phone: string | null;
    type: string; tags: string[]; leadScore: number | null;
    scoreLabel: string | null; followUpAt: string | null; createdAt: string;
  }>;

  const deals = (dealsRes.data ?? []) as Array<{
    id: string; title: string; value: number | null; status: string;
    stageId: string; closeDate: string | null; createdAt: string;
  }>;

  const stages = (stagesRes.data ?? []) as Array<{
    id: string; name: string; color: string; position: number;
  }>;

  const stageMap = Object.fromEntries(stages.map((s) => [s.id, s]));

  // Stats — use accurate counts, not the display-limited rows
  const allDeals = (dealCountRes.data ?? []) as Array<{ id: string; value: number | null; status: string }>;
  const totalContacts = contactCountRes.count ?? 0;
  const newLeads = newLeadCountRes.count ?? 0;
  const hotLeads = hotLeadCountRes.count ?? 0;
  const totalDeals = allDeals.length;
  const activeDeals = allDeals.filter((d) => d.status === 'active').length;
  const pipelineValue = allDeals.filter((d) => d.status === 'active').reduce((sum, d) => sum + (d.value ?? 0), 0);
  const wonDeals = allDeals.filter((d) => d.status === 'won').length;
  const wonValue = allDeals.filter((d) => d.status === 'won').reduce((sum, d) => sum + (d.value ?? 0), 0);

  const roleLabel = membership.role === 'broker_owner' ? 'Owner' : membership.role === 'broker_admin' ? 'Admin' : 'Realtor';
  const joinedAt = new Date(membership.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const initials = (user.name ?? user.email ?? '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  const scoreBadge = (label: string | null) => {
    if (label === 'hot') return 'text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/15';
    if (label === 'warm') return 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15';
    return 'text-muted-foreground bg-muted';
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back link */}
      <Link
        href="/broker/realtors"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} /> Back to realtors
      </Link>

      {/* Profile header */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight">{user.name ?? 'No name'}</h1>
            {user.onboard ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-0.5 text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15">
                <CheckCircle2 size={11} /> Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-0.5 text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15">
                <AlertCircle size={11} /> Pending
              </span>
            )}
            <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              {roleLabel}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Joined {joinedAt}
            {space?.slug && <> · Workspace: <span className="font-mono text-primary">/{space.slug}</span></>}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: 'People', value: totalContacts, icon: Users },
          { label: 'New people', value: newLeads, icon: PhoneIncoming },
          { label: 'Hot people', value: hotLeads, icon: Flame },
          { label: 'Active deals', value: activeDeals, icon: Briefcase },
          { label: 'Pipeline', value: formatCompact(pipelineValue), icon: TrendingUp },
          { label: 'Won', value: `${wonDeals} (${formatCompact(wonValue)})`, icon: CheckCircle2 },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="px-3 py-3">
              <p className="text-xs text-muted-foreground font-medium">{label}</p>
              <div className="flex items-center justify-between mt-1">
                <p className="text-lg font-bold tabular-nums">{value}</p>
                <Icon size={14} className="text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!space ? (
        <Card>
          <CardContent className="px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">This realtor hasn&apos;t set up their workspace yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Recent Contacts */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Recent Contacts ({totalContacts})</p>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Name</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Contact</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">No contacts yet</td>
                      </tr>
                    ) : (
                      contacts.slice(0, 20).map((c) => (
                        <tr key={c.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-2.5">
                            <p className="text-xs font-medium truncate max-w-[150px]">{c.name}</p>
                            {c.followUpAt && (
                              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                                <Calendar size={11} /> {new Date(c.followUpAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 hidden sm:table-cell">
                            <div className="space-y-0.5">
                              {c.email && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 truncate max-w-[140px]">
                                  <MailIcon size={11} /> {c.email}
                                </p>
                              )}
                              {c.phone && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Phone size={11} /> {c.phone}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {c.scoreLabel && (
                              <span className={`inline-flex text-xs font-semibold rounded-full px-2.5 py-0.5 capitalize ${scoreBadge(c.scoreLabel)}`}>
                                {c.leadScore != null ? Math.round(c.leadScore) : ''} {c.scoreLabel}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {contacts.length > 20 && (
                <div className="px-4 py-2 border-t border-border">
                  <p className="text-xs text-muted-foreground text-center">Showing 20 of {contacts.length} contacts</p>
                </div>
              )}
            </Card>
          </div>

          {/* Deals Pipeline */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Deals ({totalDeals})</p>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Deal</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Stage</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deals.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">No deals yet</td>
                      </tr>
                    ) : (
                      deals.slice(0, 20).map((d) => {
                        const stage = stageMap[d.stageId];
                        const statusColor = d.status === 'won' ? 'text-emerald-600' : d.status === 'lost' ? 'text-red-500 dark:text-red-400' : d.status === 'on_hold' ? 'text-amber-500 dark:text-amber-400' : '';
                        return (
                          <tr key={d.id} className="border-b border-border last:border-0">
                            <td className="px-4 py-2.5">
                              <p className="text-xs font-medium truncate max-w-[150px]">{d.title}</p>
                              {d.closeDate && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Close: {new Date(d.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={`inline-flex text-xs font-semibold rounded-full px-2.5 py-0.5 ${statusColor}`}
                                style={stage ? { backgroundColor: `${stage.color}15`, color: stage.color } : undefined}
                              >
                                {stage?.name ?? d.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums">
                              {d.value != null ? formatCompact(d.value) : '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {deals.length > 20 && (
                <div className="px-4 py-2 border-t border-border">
                  <p className="text-xs text-muted-foreground text-center">Showing 20 of {deals.length} deals</p>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
