import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import {
  DollarSign,
  CreditCard,
  Clock,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { isPlatformAdmin } from '@/lib/permissions';
import { SUBSCRIPTION_STATUS_COLORS } from '@/lib/constants/colors';
import { redirect } from 'next/navigation';

type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'inactive';

const PRICE_PER_SEAT = 97;


const statusBarColors: Record<SubscriptionStatus, string> = {
  active: 'bg-emerald-500',
  trialing: 'bg-blue-500',
  past_due: 'bg-amber-500',
  canceled: 'bg-red-500',
  unpaid: 'bg-red-400',
  inactive: 'bg-gray-400',
};

export default async function AdminBillingPage() {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect('/');

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 86_400_000).toISOString();

  let statusCounts: Record<SubscriptionStatus, number> = {
    active: 0,
    trialing: 0,
    past_due: 0,
    canceled: 0,
    unpaid: 0,
    inactive: 0,
  };
  let totalSpaces = 0;
  let recentSubscriptions: {
    id: string;
    name: string;
    ownerId: string;
    ownerEmail: string;
    stripeSubscriptionStatus: SubscriptionStatus;
    stripePeriodEnd: string | null;
    stripeCustomerId: string | null;
  }[] = [];
  let trialExpiringSoon: {
    id: string;
    name: string;
    ownerId: string;
    ownerEmail: string;
    stripePeriodEnd: string;
    daysLeft: number;
  }[] = [];

  try {
    const [allSpacesRes, recentRes, trialExpiringRes] = await Promise.all([
      // All spaces for status counts
      supabase
        .from('Space')
        .select('stripeSubscriptionStatus'),
      // Recent subscriptions (non-inactive, ordered by period end)
      supabase
        .from('Space')
        .select('id, name, ownerId, stripeSubscriptionStatus, stripePeriodEnd, stripeCustomerId, User!inner(email)')
        .neq('stripeSubscriptionStatus', 'inactive')
        .order('stripePeriodEnd', { ascending: false, nullsFirst: false })
        .limit(50),
      // Trials expiring within 7 days
      supabase
        .from('Space')
        .select('id, name, ownerId, stripePeriodEnd, User!inner(email)')
        .eq('stripeSubscriptionStatus', 'trialing')
        .lte('stripePeriodEnd', sevenDaysFromNow)
        .gte('stripePeriodEnd', now.toISOString())
        .order('stripePeriodEnd', { ascending: true }),
    ]);

    // Count by status
    const allSpaces = (allSpacesRes.data ?? []) as { stripeSubscriptionStatus: SubscriptionStatus }[];
    totalSpaces = allSpaces.length;
    for (const space of allSpaces) {
      const status = space.stripeSubscriptionStatus as SubscriptionStatus;
      if (status in statusCounts) {
        statusCounts[status]++;
      }
    }

    // Map recent subscriptions
    recentSubscriptions = ((recentRes.data ?? []) as any[]).map((row) => ({
      id: row.id,
      name: row.name,
      ownerId: row.ownerId,
      ownerEmail: row.User?.email ?? '',
      stripeSubscriptionStatus: row.stripeSubscriptionStatus as SubscriptionStatus,
      stripePeriodEnd: row.stripePeriodEnd,
      stripeCustomerId: row.stripeCustomerId,
    }));

    // Map trial expiring soon
    trialExpiringSoon = ((trialExpiringRes.data ?? []) as any[]).map((row) => {
      const periodEnd = new Date(row.stripePeriodEnd);
      const daysLeft = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / 86_400_000));
      return {
        id: row.id,
        name: row.name,
        ownerId: row.ownerId,
        ownerEmail: row.User?.email ?? '',
        stripePeriodEnd: row.stripePeriodEnd,
        daysLeft,
      };
    });
  } catch (err) {
    console.error('[admin/billing] DB queries failed', { error: err });
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load billing dashboard. This is usually temporary.
          </p>
          <a
            href="/admin/billing"
            className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  const mrr = statusCounts.active * PRICE_PER_SEAT;
  const paidStatuses: SubscriptionStatus[] = ['active', 'trialing', 'past_due', 'canceled', 'unpaid'];
  const displayStatuses: SubscriptionStatus[] = ['active', 'trialing', 'past_due', 'canceled', 'unpaid', 'inactive'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Subscription metrics and revenue overview
        </p>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          {
            label: 'MRR',
            value: `$${mrr.toLocaleString()}`,
            sub: `${statusCounts.active} active x $${PRICE_PER_SEAT}`,
            icon: DollarSign,
            color: 'text-emerald-500',
            accent: false,
          },
          {
            label: 'Active Subscribers',
            value: statusCounts.active,
            sub: totalSpaces > 0 ? `${Math.round((statusCounts.active / totalSpaces) * 100)}% of spaces` : '0%',
            icon: CreditCard,
            color: 'text-emerald-500',
            accent: false,
          },
          {
            label: 'Trial Users',
            value: statusCounts.trialing,
            sub: `${trialExpiringSoon.length} expiring soon`,
            icon: Clock,
            color: 'text-blue-500',
            accent: false,
          },
          {
            label: 'Past Due',
            value: statusCounts.past_due,
            sub: 'needs attention',
            icon: AlertTriangle,
            color: 'text-amber-500',
            accent: statusCounts.past_due > 0,
          },
          {
            label: 'Churned',
            value: statusCounts.canceled,
            sub: totalSpaces > 0 ? `${Math.round((statusCounts.canceled / totalSpaces) * 100)}% churn rate` : '0%',
            icon: XCircle,
            color: 'text-red-500',
            accent: statusCounts.canceled > 0,
          },
        ].map(({ label, value, sub, icon: Icon, color, accent }) => (
          <Card
            key={label}
            className={
              accent
                ? 'border-amber-300/50 bg-amber-50/30 dark:border-amber-500/20 dark:bg-amber-500/5'
                : ''
            }
          >
            <CardContent className="px-4 py-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <p
                    className={`text-2xl font-bold mt-0.5 tabular-nums ${
                      accent ? 'text-amber-600 dark:text-amber-400' : ''
                    }`}
                  >
                    {value}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
                </div>
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    accent ? 'bg-amber-100 dark:bg-amber-500/10' : 'bg-muted'
                  }`}
                >
                  <Icon
                    size={15}
                    className={accent ? 'text-amber-600 dark:text-amber-400' : color}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Subscription Breakdown ──────────────────────────────── */}
      <Card>
        <CardContent className="px-5 py-4">
          <p className="text-sm font-semibold mb-4">Subscription Breakdown</p>

          {/* Visual bar */}
          <div className="h-4 rounded-full overflow-hidden flex bg-muted mb-4">
            {displayStatuses.map((status) => {
              const count = statusCounts[status];
              if (count === 0 || totalSpaces === 0) return null;
              const pct = (count / totalSpaces) * 100;
              return (
                <div
                  key={status}
                  className={`${statusBarColors[status]} transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                  title={`${status}: ${count} (${Math.round(pct)}%)`}
                />
              );
            })}
          </div>

          {/* Status table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="text-right py-2 px-4 text-xs font-semibold text-muted-foreground">Count</th>
                  <th className="text-right py-2 pl-4 text-xs font-semibold text-muted-foreground">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {displayStatuses.map((status) => (
                  <tr key={status} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4">
                      <span className={`inline-flex text-[11px] font-semibold rounded-full px-2 py-0.5 ${SUBSCRIPTION_STATUS_COLORS[status]}`}>
                        {status}
                      </span>
                    </td>
                    <td className="text-right py-2 px-4 tabular-nums font-medium">{statusCounts[status]}</td>
                    <td className="text-right py-2 pl-4 tabular-nums text-muted-foreground">
                      {totalSpaces > 0 ? `${Math.round((statusCounts[status] / totalSpaces) * 100)}%` : '0%'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Trial Expiring Soon ─────────────────────────────────── */}
      {trialExpiringSoon.length > 0 && (
        <Card className="border-blue-300/50 bg-blue-50/30 dark:border-blue-500/20 dark:bg-blue-500/5">
          <CardContent className="px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={15} className="text-blue-500" />
              <p className="text-sm font-semibold">Trial Expiring Soon</p>
              <span className="text-[11px] text-muted-foreground">({trialExpiringSoon.length} within 7 days)</span>
            </div>
            <div className="space-y-2">
              {trialExpiringSoon.map((space) => (
                <Link key={space.id} href={`/admin/users/${space.ownerId}`}>
                  <div className="rounded-xl border border-border bg-card px-4 py-3 hover:shadow-sm transition-all duration-150">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{space.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{space.ownerEmail}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <span className={`inline-flex text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                          space.daysLeft <= 2
                            ? 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/15'
                            : 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15'
                        }`}>
                          {space.daysLeft === 0 ? 'Expires today' : `${space.daysLeft}d left`}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Recent Subscriptions ────────────────────────────────── */}
      <div>
        <p className="text-sm font-semibold mb-3">Recent Subscriptions</p>
        {recentSubscriptions.length === 0 ? (
          <Card>
            <CardContent className="px-5 py-8 text-center">
              <p className="text-sm text-muted-foreground">No active subscriptions yet.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Space Name</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Owner Email</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Period End</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Stripe Customer</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSubscriptions.map((space) => (
                    <tr key={space.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4">
                        <Link
                          href={`/admin/users/${space.ownerId}`}
                          className="font-medium hover:underline underline-offset-2"
                        >
                          {space.name}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground truncate max-w-[200px]">{space.ownerEmail}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex text-[11px] font-semibold rounded-full px-2 py-0.5 ${SUBSCRIPTION_STATUS_COLORS[space.stripeSubscriptionStatus]}`}>
                          {space.stripeSubscriptionStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 tabular-nums text-muted-foreground">
                        {space.stripePeriodEnd
                          ? new Date(space.stripePeriodEnd).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground font-mono">
                        {space.stripeCustomerId || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
