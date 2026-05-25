import { notFound, redirect } from 'next/navigation';
import { isPlatformAdmin } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  XCircle,
  Users,
  Mail,
  Briefcase,
  TrendingUp,
  Hash,
  Globe,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { formatCompact } from '@/lib/formatting';
import { BrokerageActions } from './brokerage-actions';

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params) {
  const { id } = await params;
  const { data } = await supabase.from('Brokerage').select('name').eq('id', id).maybeSingle();
  return { title: `${data?.name ?? 'Brokerage'} — Admin` };
}

export default async function AdminBrokerageDetailPage({ params }: Params) {
  const { id } = await params;

  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect('/');

  // Brokerage + owner
  const { data: brokerageRow } = await supabase
    .from('Brokerage')
    .select('*, User!Brokerage_ownerId_fkey(id, name, email)')
    .eq('id', id)
    .maybeSingle();

  if (!brokerageRow) notFound();

  const brokerage = brokerageRow as {
    id: string; name: string; status: string; websiteUrl: string | null;
    logoUrl: string | null; joinCode: string | null; createdAt: string;
    User: { id: string; name: string | null; email: string } | null;
  };

  // Members, invitations, spaces in parallel
  const [membershipsRes, invitationsRes] = await Promise.all([
    supabase
      .from('BrokerageMembership')
      .select('id, role, createdAt, userId')
      .eq('brokerageId', id)
      .order('createdAt', { ascending: true }),
    supabase
      .from('Invitation')
      .select('id, email, roleToAssign, status, createdAt, expiresAt')
      .eq('brokerageId', id)
      .order('createdAt', { ascending: false }),
  ]);

  const rawMemberships = (membershipsRes.data ?? []) as Array<{ id: string; role: string; createdAt: string; userId: string }>;
  const mUserIds = rawMemberships.map((m) => m.userId).filter(Boolean);

  let mUsers: any[] = [];
  let mSpaces: any[] = [];
  if (mUserIds.length > 0) {
    const [uRes, sRes] = await Promise.all([
      supabase.from('User').select('id, name, email, onboard').in('id', mUserIds),
      supabase.from('Space').select('id, slug, ownerId').in('ownerId', mUserIds),
    ]);
    mUsers = uRes.data ?? [];
    mSpaces = sRes.data ?? [];
  }
  const mUserMap = new Map(mUsers.map((u: any) => [u.id, u]));
  const mSpaceMap = new Map(mSpaces.map((s: any) => [s.ownerId, s]));

  const members = rawMemberships.map((m) => ({
    ...m,
    User: mUserMap.get(m.userId) ?? null,
    Space: mSpaceMap.get(m.userId) ?? null,
  })) as Array<{
    id: string; role: string; createdAt: string; userId: string;
    User: { id: string; name: string | null; email: string; onboard: boolean } | null;
    Space: { id: string; slug: string } | null;
  }>;

  const invitations = (invitationsRes.data ?? []) as Array<{
    id: string; email: string; roleToAssign: string; status: string;
    createdAt: string; expiresAt: string;
  }>;

  // Per-space stats
  const spaceIds = members.map((m) => m.Space?.id).filter(Boolean) as string[];

  const [dealRows, pendingInviteCount] = await Promise.all([
    spaceIds.length > 0
      ? supabase.from('Deal').select('spaceId, value').in('spaceId', spaceIds).then((r) => r.data ?? [])
      : Promise.resolve([]),
    supabase.from('Invitation').select('*', { count: 'exact', head: true }).eq('brokerageId', id).eq('status', 'pending'),
  ]);

  const totalDeals = (dealRows as { value: number | null }[]).length;
  const totalPipeline = (dealRows as { value: number | null }[]).reduce((a, r) => a + (r.value ?? 0), 0);

  const roleLabel = (role: string) =>
    role === 'broker_owner' ? 'Owner' : role === 'broker_admin' ? 'Admin' : 'Realtor';

  const statusLabel = (s: string) =>
    s === 'accepted' ? 'Accepted' : s === 'cancelled' ? 'Revoked' : s === 'expired' ? 'Expired' : 'Pending';

  const createdAt = new Date(brokerage.createdAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  const owner = brokerage.User;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/admin/brokerages"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} /> Back to brokerages
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Building2 size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{brokerage.name}</h1>
            <p className="text-sm text-muted-foreground">
              {owner?.name ?? owner?.email ?? 'Unknown owner'} · Created {createdAt}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {brokerage.status === 'active' ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-1 text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15">
              <CheckCircle2 size={11} /> Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-1 text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/15">
              <XCircle size={11} /> Suspended
            </span>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Members',         value: members.length,              icon: Users,     color: 'text-blue-500'   },
          { label: 'Pending invites', value: pendingInviteCount.count ?? 0, icon: Mail,    color: 'text-amber-500'  },
          { label: 'Active deals',    value: totalDeals,                  icon: Briefcase, color: 'text-cyan-500'   },
          { label: 'Pipeline value',  value: formatCompact(totalPipeline),icon: TrendingUp,color: 'text-rose-500'   },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="px-4 py-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <p className="text-2xl font-bold mt-1 tabular-nums">{value}</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <Icon size={15} className={color} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: members table */}
        <div className="lg:col-span-2 space-y-3">
          <p className="text-sm font-semibold">Members</p>
          <Card>
            {members.length === 0 ? (
              <CardContent className="px-5 py-8 text-center">
                <p className="text-sm text-muted-foreground">No members yet.</p>
              </CardContent>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Member</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Role</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">Joined</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => {
                      const user = m.User;
                      const initials = (user?.name ?? user?.email ?? '?')
                        .split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
                      const joined = new Date(m.createdAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      });
                      return (
                        <tr key={m.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-semibold text-primary flex-shrink-0">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <Link
                                  href={`/admin/users/${m.userId}`}
                                  className="font-medium text-xs hover:text-primary hover:underline underline-offset-2 truncate block"
                                >
                                  {user?.name ?? 'No name'}
                                </Link>
                                <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                              {roleLabel(m.role)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{joined}</td>
                          <td className="px-4 py-3 text-right">
                            {user?.onboard ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15">
                                <CheckCircle2 size={9} /> Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15">
                                <AlertCircle size={9} /> Pending
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {m.role !== 'broker_owner' && (
                              <BrokerageActions
                                action="remove-member"
                                membershipId={m.id}
                                label={user?.name ?? user?.email ?? 'this member'}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Right: brokerage info + actions */}
        <div className="space-y-4">
          {/* Info card */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">Details</p>
            <Card>
              <CardContent className="px-4 py-3 space-y-3">
                <div className="flex items-start gap-2.5">
                  <Hash size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">ID</p>
                    <p className="text-xs font-mono break-all">{brokerage.id}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Users size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Owner</p>
                    <Link
                      href={`/admin/users/${owner?.id}`}
                      className="text-xs hover:text-primary hover:underline underline-offset-2"
                    >
                      {owner?.name ?? owner?.email ?? '—'}
                    </Link>
                  </div>
                </div>
                {brokerage.joinCode && (
                  <div className="flex items-start gap-2.5">
                    <Hash size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Join Code</p>
                      <p className="text-xs font-mono">{brokerage.joinCode}</p>
                    </div>
                  </div>
                )}
                {brokerage.websiteUrl && (
                  <div className="flex items-start gap-2.5">
                    <Globe size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Website</p>
                      <p className="text-xs truncate">{brokerage.websiteUrl}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2.5">
                  <Calendar size={13} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Created</p>
                    <p className="text-xs">{createdAt}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Admin actions */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">Admin Actions</p>
            <Card>
              <CardContent className="px-4 py-4 space-y-2">
                <BrokerageActions
                  action="toggle-status"
                  brokerageId={brokerage.id}
                  currentStatus={brokerage.status}
                />
                <BrokerageActions
                  action="delete"
                  brokerageId={brokerage.id}
                  brokerageName={brokerage.name}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Invitations */}
      <div className="space-y-3">
        <p className="text-sm font-semibold">Invitations</p>
        {invitations.length === 0 ? (
          <Card>
            <CardContent className="px-5 py-8 text-center">
              <p className="text-sm text-muted-foreground">No invitations sent yet.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">Sent</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">Expires</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((inv) => {
                    const sent = new Date(inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const expires = new Date(inv.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    return (
                      <tr key={inv.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 text-xs font-medium">{inv.email}</td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                            {inv.roleToAssign === 'broker_admin' ? 'Admin' : 'Realtor'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{sent}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{expires}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                            inv.status === 'accepted'
                              ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15'
                              : inv.status === 'pending'
                                ? 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15'
                                : 'text-muted-foreground bg-muted'
                          }`}>
                            {statusLabel(inv.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {inv.status === 'pending' && (
                            <BrokerageActions
                              action="revoke-invite"
                              invitationId={inv.id}
                              label={inv.email}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
