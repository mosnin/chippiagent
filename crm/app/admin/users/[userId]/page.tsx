import { notFound } from 'next/navigation';
import { createClerkClient } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { buildIntakeUrl } from '@/lib/intake';
import { getOnboardingStatus } from '@/lib/onboarding';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Mail,
  Phone,
  Link2,
  Building2,
  Calendar,
  Hash,
  PhoneIncoming,
  Users,
  CreditCard,
  ShieldBan,
} from 'lucide-react';
import Link from 'next/link';
import { UserActions } from './user-actions';
import type { User, Space, SpaceSetting } from '@/lib/types';
import { cn } from '@/lib/utils';

const clerkAdmin = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const { data: rows } = await supabase
    .from('User')
    .select('name, email')
    .eq('id', userId)
    .maybeSingle();
  const user = rows as { name: string | null; email: string } | null;
  return {
    title: `${user?.name || user?.email || 'User'} — Admin — Chippi`,
  };
}

function formatDate(date: Date | string | null) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function InfoRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof Mail;
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={13} className="text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            'text-sm font-medium mt-0.5 break-all',
            mono ? 'font-mono text-xs' : '',
            !value ? 'text-muted-foreground' : '',
          )}
        >
          {value || '—'}
        </p>
      </div>
    </div>
  );
}

const SUB_STATUS_STYLES: Record<string, string> = {
  active: 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15',
  trialing: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/15',
  past_due: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
  canceled: 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-500/15',
  unpaid: 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/15',
  inactive: 'text-slate-500 bg-slate-50 dark:text-slate-500 dark:bg-slate-500/10',
};

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const { data: userRow, error: userError } = await supabase
    .from('User')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (userError) throw userError;
  if (!userRow) notFound();
  const user = userRow as User;

  // Check Clerk ban status (source of truth for suspension) + MFA + sessions
  let isSuspended = false;
  let twoFactorEnabled = false;
  let totpEnabled = false;
  let backupCodeEnabled = false;
  let activeSessions: {
    id: string;
    lastActiveAt: number;
    createdAt: number;
    expireAt: number;
    clientId: string;
    ipAddress: string | null;
    city: string | null;
    country: string | null;
    browserName: string | null;
    deviceType: string | null;
  }[] = [];
  try {
    const clerkUser = await clerkAdmin.users.getUser(user.clerkId);
    isSuspended = clerkUser.banned ?? false;
    twoFactorEnabled = clerkUser.twoFactorEnabled ?? false;
    totpEnabled = clerkUser.totpEnabled ?? false;
    backupCodeEnabled = clerkUser.backupCodeEnabled ?? false;
  } catch {
    // Fall back to DB platformRole if Clerk lookup fails
    isSuspended = (user.platformRole as string) === 'banned';
  }

  try {
    const sessResp = await clerkAdmin.sessions.getSessionList({
      userId: user.clerkId,
      status: 'active',
    });
    const list = Array.isArray(sessResp) ? sessResp : sessResp.data;
    activeSessions = list.map((s) => ({
      id: s.id,
      lastActiveAt: s.lastActiveAt,
      createdAt: s.createdAt,
      expireAt: s.expireAt,
      clientId: s.clientId,
      ipAddress: s.latestActivity?.ipAddress ?? null,
      city: s.latestActivity?.city ?? null,
      country: s.latestActivity?.country ?? null,
      browserName: s.latestActivity?.browserName ?? null,
      deviceType: s.latestActivity?.deviceType ?? null,
    }));
  } catch {
    activeSessions = [];
  }

  // Fetch space
  const { data: spaceData, error: spaceError } = await supabase
    .from('Space')
    .select('*')
    .eq('ownerId', user.id)
    .limit(1)
    .maybeSingle();
  if (spaceError) throw spaceError;
  const spaceRow = spaceData as (Space & Record<string, unknown>) | null;

  // Fetch settings + counts if space exists
  let settings: SpaceSetting | null = null;
  let contactCount = 0, dealCount = 0, stageCount = 0;
  if (spaceRow) {
    const [settingsRes, contactCountRes, dealCountRes, stageCountRes] = await Promise.all([
      supabase
        .from('SpaceSetting')
        .select(
          'id, spaceId, phoneNumber, businessName, timezone, notifications, smsNotifications, notifyNewLeads, notifyTourBookings, notifyNewDeals, notifyFollowUps',
        )
        .eq('spaceId', spaceRow.id)
        .maybeSingle(),
      supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', spaceRow.id),
      supabase.from('Deal').select('*', { count: 'exact', head: true }).eq('spaceId', spaceRow.id),
      supabase.from('DealStage').select('*', { count: 'exact', head: true }).eq('spaceId', spaceRow.id),
    ]);
    settings = (settingsRes.data as SpaceSetting) ?? null;
    contactCount = contactCountRes.count ?? 0;
    dealCount = dealCountRes.count ?? 0;
    stageCount = stageCountRes.count ?? 0;
  }

  const space = spaceRow
    ? {
        ...spaceRow,
        settings,
        _count: { contacts: contactCount, deals: dealCount, stages: stageCount },
      }
    : null;

  const fullUser = { ...user, space };
  const onboarding = getOnboardingStatus(fullUser);
  const intakeUrl = fullUser.space ? buildIntakeUrl(fullUser.space.slug) : null;

  // Recent leads for this space
  let recentLeads: {
    id: string;
    name: string;
    phone: string | null;
    createdAt: string;
    scoringStatus: string;
    scoreLabel: string | null;
  }[] = [];
  let failedLeads = 0;
  if (fullUser.space) {
    const [leadRows, failedCount] = await Promise.all([
      supabase
        .from('Contact')
        .select('id, name, phone, createdAt, scoringStatus, scoreLabel')
        .eq('spaceId', fullUser.space.id)
        .contains('tags', ['application-link'])
        .order('createdAt', { ascending: false })
        .limit(8),
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .eq('spaceId', fullUser.space.id)
        .eq('scoringStatus', 'failed'),
    ]);
    if (leadRows.error) throw leadRows.error;
    recentLeads = (leadRows.data ?? []) as typeof recentLeads;
    failedLeads = failedCount.count ?? 0;
  }

  const subStatus = (fullUser.space as any)?.stripeSubscriptionStatus ?? null;
  const periodEnd = (fullUser.space as any)?.stripePeriodEnd ?? null;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back nav */}
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} />
        Back to users
      </Link>

      {/* Header */}
      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-base font-semibold text-primary flex-shrink-0">
              {(fullUser.name || fullUser.email || '?')
                .split(' ')
                .map((n: string) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {fullUser.name || 'No name'}
              </h1>
              <p className="text-sm text-muted-foreground">{fullUser.email}</p>
            </div>
          </div>

          {/* Status badges */}
          <div className="flex flex-wrap items-center gap-2">
            {isSuspended && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-1 text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/15">
                <ShieldBan size={11} />
                Suspended
              </span>
            )}
            <span
              className={cn(
                'inline-flex text-xs font-semibold rounded-full px-2.5 py-1',
                onboarding.isOnboarded
                  ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15'
                  : 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
              )}
            >
              {onboarding.isOnboarded ? 'Onboarded' : 'Not onboarded'}
            </span>
            {subStatus && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-1',
                  SUB_STATUS_STYLES[subStatus] ?? SUB_STATUS_STYLES.inactive,
                )}
              >
                <CreditCard size={11} />
                {subStatus}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Account + Workspace grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Account details */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Account
          </p>
          <Card>
            <CardContent className="px-5 py-1 divide-y divide-border">
              <InfoRow icon={Mail} label="Email" value={fullUser.email} />
              <InfoRow icon={Hash} label="User ID" value={fullUser.id} mono />
              <InfoRow icon={Hash} label="Clerk ID" value={fullUser.clerkId} mono />
              <InfoRow
                icon={Calendar}
                label="Signed up"
                value={formatDate(fullUser.createdAt)}
              />
              <InfoRow
                icon={CheckCircle2}
                label="Onboarding"
                value={
                  onboarding.isOnboarded
                    ? `Complete (step ${fullUser.onboardingCurrentStep})`
                    : `In progress — step ${fullUser.onboardingCurrentStep} of 7`
                }
              />
              <InfoRow
                icon={Calendar}
                label="Onboarding started"
                value={formatDate(fullUser.onboardingStartedAt)}
              />
              <InfoRow
                icon={Calendar}
                label="Onboarding completed"
                value={formatDate(fullUser.onboardingCompletedAt)}
              />
            </CardContent>
          </Card>
        </div>

        {/* Workspace */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Workspace
          </p>
          {fullUser.space ? (
            <Card>
              <CardContent className="px-5 py-1 divide-y divide-border">
                <InfoRow icon={Building2} label="Name" value={fullUser.space.name} />
                <InfoRow icon={Hash} label="Slug" value={fullUser.space.slug} mono />
                {intakeUrl && (
                  <InfoRow icon={Link2} label="Intake URL" value={intakeUrl} mono />
                )}
                <InfoRow
                  icon={Phone}
                  label="Phone"
                  value={fullUser.space.settings?.phoneNumber || null}
                />
                <InfoRow
                  icon={Building2}
                  label="Business name"
                  value={fullUser.space.settings?.businessName || null}
                />
                <InfoRow
                  icon={CreditCard}
                  label="Subscription"
                  value={
                    subStatus
                      ? `${subStatus}${periodEnd ? ` · ends ${new Date(periodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}`
                      : null
                  }
                />
                <div className="flex items-start gap-3 py-2.5">
                  <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Users size={13} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Usage</p>
                    <div className="flex flex-wrap gap-3 mt-1">
                      <span className="text-sm">
                        <strong>{fullUser.space._count.contacts}</strong>{' '}
                        <span className="text-muted-foreground">contacts</span>
                      </span>
                      <span className="text-sm">
                        <strong>{fullUser.space._count.deals}</strong>{' '}
                        <span className="text-muted-foreground">deals</span>
                      </span>
                      <span className="text-sm">
                        <strong>{fullUser.space._count.stages}</strong>{' '}
                        <span className="text-muted-foreground">stages</span>
                      </span>
                      {failedLeads > 0 && (
                        <span className="text-sm text-amber-600 dark:text-amber-400">
                          <strong>{failedLeads}</strong> failed scoring
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="px-5 py-8 text-center">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <XCircle size={18} className="text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No workspace</p>
                <p className="text-xs text-muted-foreground mt-1">
                  This user has not created a workspace yet.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Recent leads table */}
      {fullUser.space && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Recent Leads
          </p>
          {recentLeads.length === 0 ? (
            <Card>
              <CardContent className="px-5 py-8 text-center">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <PhoneIncoming size={18} className="text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No leads yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Name
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
                      Phone
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Score
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {recentLeads.map((lead) => (
                    <tr key={lead.id}>
                      <td className="px-4 py-3 font-medium">{lead.name}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                        {lead.phone || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {lead.scoringStatus === 'scored' && lead.scoreLabel ? (
                          <span
                            className={cn(
                              'text-[10px] font-semibold rounded-full px-2 py-0.5',
                              lead.scoreLabel === 'hot'
                                ? 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/15'
                                : lead.scoreLabel === 'warm'
                                  ? 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15'
                                  : lead.scoreLabel === 'cold'
                                    ? 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/15'
                                    : 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-500/15',
                            )}
                          >
                            {lead.scoreLabel}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                            {lead.scoringStatus === 'failed' ? 'unscored' : lead.scoringStatus}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell whitespace-nowrap">
                        {new Date(lead.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Admin actions */}
      <UserActions
        userId={fullUser.id}
        clerkId={fullUser.clerkId}
        email={fullUser.email}
        isOnboarded={onboarding.isOnboarded}
        hasSpace={onboarding.hasSpace}
        intakeUrl={intakeUrl}
        isSuspended={isSuspended}
        subscriptionStatus={subStatus ?? 'inactive'}
        stripePeriodEnd={periodEnd}
        twoFactorEnabled={twoFactorEnabled}
        totpEnabled={totpEnabled}
        backupCodeEnabled={backupCodeEnabled}
        activeSessions={activeSessions}
      />
    </div>
  );
}
