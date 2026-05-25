import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Users, TrendingUp, CreditCard, CheckCircle2, XCircle, AlertTriangle, DollarSign } from 'lucide-react';
import { isPlatformAdmin } from '@/lib/permissions';
import { redirect } from 'next/navigation';

type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'inactive';

type UserRow = {
  id: string;
  createdAt: string;
  onboard: boolean;
  Space:
    | { id: string; stripeSubscriptionStatus: SubscriptionStatus | null }
    | { id: string; stripeSubscriptionStatus: SubscriptionStatus | null }[]
    | null;
};

type CohortMetrics = {
  weekStart: string;
  signups: number;
  onboarded: number;
  workspace: number;
  trialing: number;
  paid: number;
  churned: number;
  active: number;
};

// Normalize to Monday 00:00 UTC (ISO week start)
function weekStartOf(d: Date): Date {
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff)
  );
  return monday;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.round((n / d) * 100);
}

export default async function AdminCohortsPage() {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect('/');

  const now = new Date();
  const thisWeekStart = weekStartOf(now);
  // 12 weeks back from current week-start
  const earliestWeek = new Date(thisWeekStart.getTime() - 11 * 7 * 86_400_000);
  const earliestIso = earliestWeek.toISOString();

  // Seed the cohort map with the last 12 weeks (even if empty)
  const cohorts = new Map<string, CohortMetrics>();
  for (let i = 11; i >= 0; i--) {
    const wk = new Date(thisWeekStart.getTime() - i * 7 * 86_400_000);
    const key = isoDate(wk);
    cohorts.set(key, {
      weekStart: key,
      signups: 0,
      onboarded: 0,
      workspace: 0,
      trialing: 0,
      paid: 0,
      churned: 0,
      active: 0,
    });
  }

  // Top-level stats
  let totalSignups = 0;
  let totalPaid = 0;
  let totalTrial = 0;
  let totalPastDue = 0;
  let totalCanceled = 0;

  let fetchError = false;

  try {
    const { data, error } = await supabase
      .from('User')
      .select('id, createdAt, onboard, Space(id, stripeSubscriptionStatus)')
      .gte('createdAt', earliestIso)
      .order('createdAt', { ascending: true });

    if (error) throw error;

    for (const row of (data ?? []) as UserRow[]) {
      const created = new Date(row.createdAt);
      const wkKey = isoDate(weekStartOf(created));
      const bucket = cohorts.get(wkKey);
      if (!bucket) continue; // older than window

      bucket.signups += 1;
      if (row.onboard) bucket.onboarded += 1;

      const space = Array.isArray(row.Space) ? row.Space[0] : row.Space;
      if (space) {
        bucket.workspace += 1;
        const status = space.stripeSubscriptionStatus;
        if (status === 'trialing') bucket.trialing += 1;
        if (status === 'active' || status === 'past_due') bucket.paid += 1;
        if (status === 'canceled') bucket.churned += 1;
        if (status === 'active') bucket.active += 1;
      }
    }

    // Totals from ALL users (not just last 12 weeks) for accurate top-level stats
    const [totalUsersRes, subStatusRes] = await Promise.all([
      supabase.from('User').select('*', { count: 'exact', head: true }),
      supabase.from('Space').select('stripeSubscriptionStatus'),
    ]);

    totalSignups = totalUsersRes.count ?? 0;
    const statuses = (subStatusRes.data ?? []) as {
      stripeSubscriptionStatus: SubscriptionStatus | null;
    }[];
    for (const s of statuses) {
      if (s.stripeSubscriptionStatus === 'active') totalPaid += 1;
      else if (s.stripeSubscriptionStatus === 'trialing') totalTrial += 1;
      else if (s.stripeSubscriptionStatus === 'past_due') totalPastDue += 1;
      else if (s.stripeSubscriptionStatus === 'canceled') totalCanceled += 1;
    }
  } catch (err) {
    console.error('[admin/cohorts] DB query failed', err);
    fetchError = true;
  }

  const overallPaidRate = pct(totalPaid, totalSignups);
  const overallChurnRate =
    totalPaid + totalCanceled > 0
      ? Math.round((totalCanceled / (totalPaid + totalCanceled)) * 100)
      : 0;

  const rows = Array.from(cohorts.values()).sort((a, b) =>
    b.weekStart.localeCompare(a.weekStart)
  );

  // Color-coded mini bar
  const Bar = ({ pct, color }: { pct: number; color: string }) => (
    <div className="h-1 bg-muted rounded-full overflow-hidden mt-1">
      <div
        className={`h-full ${color} rounded-full transition-all duration-500`}
        style={{ width: `${Math.max(pct, 2)}%` }}
      />
    </div>
  );

  const Cell = ({
    count,
    total,
    color,
  }: {
    count: number;
    total: number;
    color: string;
  }) => {
    const p = pct(count, total);
    return (
      <td className="px-3 py-2.5 text-xs tabular-nums align-top">
        <div className="flex items-baseline gap-1">
          <span className="font-semibold">{count}</span>
          <span className="text-muted-foreground">({p}%)</span>
        </div>
        <Bar pct={p} color={color} />
      </td>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Cohort Analysis</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Weekly signup cohorts and their retention through the funnel
          </p>
        </div>
      </div>

      <Card className="rounded-xl border bg-card">
        <CardContent className="px-5 py-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Each row represents users who signed up during a particular ISO week
            (Monday start, UTC). Percentages are calculated against the signup
            count for that cohort. Paid = <code>active</code> +{' '}
            <code>past_due</code>. Churned = <code>canceled</code>. Still active ={' '}
            <code>active</code> only. The most recent cohorts will naturally
            show lower conversion rates as users haven&apos;t had time to
            progress through the funnel yet.
          </p>
        </CardContent>
      </Card>

      {fetchError && (
        <Card className="rounded-xl border border-amber-300/50 bg-amber-50/30 dark:border-amber-500/20 dark:bg-amber-500/5">
          <CardContent className="px-5 py-4">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Could not load cohort data. Check server logs.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Cohort retention table ───────────────────────────────────── */}
      <Card className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr className="text-left">
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Week
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Signups
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Onboarded
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Workspace
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Trial
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Paid
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Churned
                </th>
                <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Still active
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.weekStart} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5 text-xs font-medium whitespace-nowrap align-top">
                    {formatWeekLabel(r.weekStart)}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-semibold tabular-nums align-top">
                    {r.signups}
                  </td>
                  <Cell count={r.onboarded} total={r.signups} color="bg-emerald-500" />
                  <Cell count={r.workspace} total={r.signups} color="bg-violet-500" />
                  <Cell count={r.trialing} total={r.signups} color="bg-blue-500" />
                  <Cell count={r.paid} total={r.signups} color="bg-primary" />
                  <Cell count={r.churned} total={r.signups} color="bg-rose-500" />
                  <Cell count={r.active} total={r.signups} color="bg-emerald-600" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Top-level stats ──────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Overall
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {[
            {
              label: 'Total signups',
              value: totalSignups,
              icon: Users,
              color: 'text-blue-500',
            },
            {
              label: 'Paid',
              value: totalPaid,
              icon: CheckCircle2,
              color: 'text-emerald-500',
            },
            {
              label: 'Trial',
              value: totalTrial,
              icon: CreditCard,
              color: 'text-blue-500',
            },
            {
              label: 'Past due',
              value: totalPastDue,
              icon: AlertTriangle,
              color: 'text-amber-500',
            },
            {
              label: 'Canceled',
              value: totalCanceled,
              icon: XCircle,
              color: 'text-rose-500',
            },
            {
              label: 'Paid conv.',
              value: `${overallPaidRate}%`,
              icon: TrendingUp,
              color: 'text-emerald-500',
            },
            {
              label: 'Churn rate',
              value: `${overallChurnRate}%`,
              icon: DollarSign,
              color: 'text-rose-500',
            },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="rounded-xl border bg-card h-full">
              <CardContent className="p-5 h-full flex flex-col justify-between">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium">{label}</p>
                    <p className="text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
                  </div>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-muted">
                    <Icon size={15} className={color} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
