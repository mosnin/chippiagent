import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ArrowRight } from 'lucide-react';
import { computeCommission, type CommissionSplit } from '@/lib/commissions';
import { formatCurrency, formatCompact } from '@/lib/formatting';
import {
  H1,
  H3,
  TITLE_FONT,
  STAT_NUMBER_COMPACT,
  SECTION_LABEL,
  PAGE_RHYTHM,
} from '@/lib/typography';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface DealRow {
  id: string;
  title: string;
  status: 'active' | 'won' | 'lost' | 'on_hold';
  value: number | null;
  commissionRate: number | null;
  closeDate: string | null;
  updatedAt: string;
}

/**
 * YTD commission overview. Same data path as the previous version, redressed
 * in the locked paper-flat design language. Two roll-ups:
 *   Won this year → "closed net" + "closed GCI"
 *   Active        → "expected net" (in flight, not guaranteed)
 * Plus "still owed out" — unpaid outgoing splits across closed deals.
 */
export default async function PropertiesCommissionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();

  const [dealsResult, splitsResult] = await Promise.all([
    supabase
      .from('Deal')
      .select('id, title, status, value, commissionRate, closeDate, updatedAt')
      .eq('spaceId', space.id)
      .order('updatedAt', { ascending: false }),
    supabase
      .from('CommissionSplit')
      .select('*')
      .eq('spaceId', space.id),
  ]);

  const deals = (dealsResult.data ?? []) as DealRow[];
  const splits = (splitsResult.data ?? []) as CommissionSplit[];
  const splitsByDeal = new Map<string, CommissionSplit[]>();
  for (const s of splits) {
    const arr = splitsByDeal.get(s.dealId) ?? [];
    arr.push(s);
    splitsByDeal.set(s.dealId, arr);
  }

  const closedYtd = deals.filter(
    (d) => d.status === 'won' && d.updatedAt >= yearStart,
  );
  const inFlight = deals.filter((d) => d.status === 'active');

  let closedNet = 0;
  let expectedNet = 0;
  let stillOwedOut = 0;
  let closedGci = 0;
  let topClosed: { deal: DealRow; net: number } | null = null;

  for (const d of closedYtd) {
    const r = computeCommission(d.value, d.commissionRate, splitsByDeal.get(d.id) ?? []);
    closedNet += r.net;
    closedGci += r.gci;
    stillOwedOut += r.outgoingUnpaid;
    if (!topClosed || r.net > topClosed.net) {
      topClosed = { deal: d, net: r.net };
    }
  }
  for (const d of inFlight) {
    const r = computeCommission(d.value, d.commissionRate, splitsByDeal.get(d.id) ?? []);
    expectedNet += r.net;
  }

  // Narration ladder — pick the loudest fact about money. Hand-coded, inline.
  const subtitle = (() => {
    if (closedYtd.length === 0 && inFlight.length === 0) {
      return 'Quiet quarter. Nothing closed, nothing in flight.';
    }
    if (closedYtd.length === 0) {
      return `Nothing closed yet this year. ${formatCompact(expectedNet)} in flight.`;
    }
    if (topClosed && closedYtd.length > 1) {
      return `${formatCompact(closedNet)} earned year-to-date. Top: the ${topClosed.deal.title} closing — ${formatCompact(topClosed.net)}.`;
    }
    if (topClosed) {
      return `${formatCompact(closedNet)} earned year-to-date — the ${topClosed.deal.title} closing.`;
    }
    return `${formatCompact(closedNet)} earned year-to-date.`;
  })();

  return (
    <div className={cn(PAGE_RHYTHM, 'max-w-[1500px]')}>
      {/* Header — H1 + Chippi-voiced subtitle naming the loudest money fact.
          The stat strip below is the supporting evidence. Commissions is its
          own destination now (the standalone Properties list has been cut),
          so no back-link — the sidebar is the way home. */}
      <header className="space-y-1.5">
        <p className="text-sm text-muted-foreground">Commissions.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Commissions
        </h1>
        <p className="text-sm text-muted-foreground">
          {subtitle}
        </p>
      </header>

      {/* Stat strip — paper-flat, hairline-divided */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70">
        <StatCell
          value={formatCompact(closedNet)}
          label="Closed net YTD"
          sub={`${closedYtd.length} won deal${closedYtd.length === 1 ? '' : 's'}`}
        />
        <StatCell
          value={formatCompact(closedGci)}
          label="Closed GCI YTD"
          sub="before splits"
        />
        <StatCell
          value={formatCompact(expectedNet)}
          label="Expected net"
          sub={`${inFlight.length} active deal${inFlight.length === 1 ? '' : 's'}`}
        />
        <StatCell
          value={formatCompact(stillOwedOut)}
          label="Still owed out"
          sub="unpaid splits across closed"
        />
      </div>

      {/* Closed this year */}
      <Section
        title="Closed this year"
        count={closedYtd.length}
        empty={
          <EmptyRow text="Nothing closed yet this year. The first win lands here." />
        }
      >
        {closedYtd.length > 0 && (
          <CommissionTable rows={closedYtd} splitsByDeal={splitsByDeal} slug={slug} />
        )}
      </Section>

      {/* In flight */}
      <Section
        title="In flight"
        count={inFlight.length}
        empty={<EmptyRow text="Nothing in flight. Quiet pipeline." />}
      >
        {inFlight.length > 0 && (
          <CommissionTable rows={inFlight} splitsByDeal={splitsByDeal} slug={slug} />
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/70 bg-background overflow-hidden">
      <header className="px-5 py-3 border-b border-border/70 flex items-center gap-2">
        <h3 className={H3}>{title}</h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span>
      </header>
      {count === 0 ? empty : children}
    </section>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="px-5 py-6 text-xs text-muted-foreground text-center">{text}</p>;
}

function CommissionTable({
  rows,
  splitsByDeal,
  slug,
}: {
  rows: DealRow[];
  splitsByDeal: Map<string, CommissionSplit[]>;
  slug: string;
}) {
  return (
    <div className="divide-y divide-border/70">
      <div className={cn('hidden sm:grid grid-cols-[minmax(0,2fr)_100px_70px_100px_110px_28px] px-5 py-2 bg-foreground/[0.02]', SECTION_LABEL)}>
        <span>Deal</span>
        <span className="text-right">Value</span>
        <span className="text-right">Rate</span>
        <span className="text-right">GCI</span>
        <span className="text-right">Net</span>
        <span />
      </div>
      {rows.map((d) => {
        const r = computeCommission(d.value, d.commissionRate, splitsByDeal.get(d.id) ?? []);
        return (
          <Link
            key={d.id}
            href={`/s/${slug}/deals/${d.id}`}
            className="group flex flex-col sm:grid sm:grid-cols-[minmax(0,2fr)_100px_70px_100px_110px_28px] sm:items-center px-5 py-3 hover:bg-foreground/[0.04] active:bg-foreground/[0.045] transition-colors duration-150"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{d.title}</p>
              {d.closeDate && (
                <p className="text-[11px] text-muted-foreground">
                  {new Date(d.closeDate).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              )}
            </div>
            <span className="hidden sm:block text-right tabular-nums text-sm">
              {d.value != null ? formatCurrency(d.value) : '—'}
            </span>
            <span className="hidden sm:block text-right tabular-nums text-sm text-muted-foreground">
              {d.commissionRate != null ? `${d.commissionRate}%` : '—'}
            </span>
            <span className="hidden sm:block text-right tabular-nums text-sm text-muted-foreground">
              {formatCurrency(r.gci)}
            </span>
            <span className="hidden sm:block text-right tabular-nums text-sm text-foreground">
              {formatCurrency(r.net)}
            </span>
            <span className="hidden sm:flex justify-end text-muted-foreground/40 group-hover:text-foreground transition-colors duration-150">
              <ArrowRight size={13} strokeWidth={1.75} />
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function StatCell({
  value,
  label,
  sub,
}: {
  value: string;
  label: string;
  sub: string;
}) {
  return (
    <div className="bg-background p-5">
      <p className={STAT_NUMBER_COMPACT} style={TITLE_FONT}>
        {value}
      </p>
      <p className="text-sm text-foreground mt-1.5">{label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}
