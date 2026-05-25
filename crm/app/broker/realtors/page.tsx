import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import type { Metadata } from 'next';
import { H1, TITLE_FONT } from '@/lib/typography';
import { RealtorsClient, type RealtorRow } from './realtors-client';

export const metadata: Metadata = { title: 'Realtors — Broker Dashboard' };

export default async function BrokerRealtorsPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  const { brokerage } = ctx;

  const members = await getBrokerageMembers(brokerage.id, { includeOnboard: true, includeSpaceName: true });

  const spaceIds = members.map((m) => m.Space?.id).filter(Boolean) as string[];

  // Pull only what the table actually shows: people on file + deals (count + value).
  // The old 4-stat summary cards and lead/hot-lead columns were chrome — cut.
  const [contactRows, dealRows] = await Promise.all([
    spaceIds.length > 0
      ? supabase
          .from('Contact')
          .select('spaceId')
          .in('spaceId', spaceIds)
          .not('tags', 'cs', '["application-link"]')
          .limit(10000)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    spaceIds.length > 0
      ? supabase
          .from('Deal')
          .select('spaceId, value')
          .in('spaceId', spaceIds)
          .limit(10000)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  const peopleBySpace = (contactRows as { spaceId: string }[]).reduce<Record<string, number>>(
    (acc, r) => { acc[r.spaceId] = (acc[r.spaceId] ?? 0) + 1; return acc; },
    {}
  );
  const dealsBySpace = (dealRows as { spaceId: string; value: number | null }[]).reduce<
    Record<string, { count: number; value: number }>
  >(
    (acc, r) => {
      if (!acc[r.spaceId]) acc[r.spaceId] = { count: 0, value: 0 };
      acc[r.spaceId].count += 1;
      acc[r.spaceId].value += r.value ?? 0;
      return acc;
    },
    {}
  );

  const realtors: RealtorRow[] = members.map((m) => {
    const sid = m.Space?.id ?? null;
    return {
      membershipId: m.id,
      userId: m.userId,
      name: m.User?.name ?? null,
      email: m.User?.email ?? '',
      onboard: m.User?.onboard ?? false,
      role: m.role,
      spaceSlug: m.Space?.slug ?? null,
      people:   sid ? (peopleBySpace[sid] ?? 0) : 0,
      deals:    sid ? (dealsBySpace[sid]?.count ?? 0) : 0,
      pipeline: sid ? (dealsBySpace[sid]?.value ?? 0) : 0,
    };
  });

  // ── Page-scoped narration. Pick the loudest fact: top performer by deals,
  // a quiet-week call-out, or a "nobody onboard" flag. Hand-coded ladder, no
  // agent call — this is the deals-page-cuts pattern.
  const subtitle = (() => {
    if (realtors.length === 0) {
      return 'No realtors yet. Send the first invite.';
    }
    const active = realtors.filter((r) => r.onboard);
    if (active.length === 0) {
      return `${realtors.length} invited. Nobody onboard yet.`;
    }
    const ranked = [...realtors].sort((a, b) => b.deals - a.deals);
    const top = ranked[0];
    if (top.deals > 0) {
      const firstName = (top.name ?? top.email).split(/\s+/)[0];
      return `${firstName} leads the team — ${top.deals} ${top.deals === 1 ? 'deal' : 'deals'} in flight.`;
    }
    const quiet = realtors.filter((r) => r.onboard && r.people === 0).length;
    if (quiet > 0) {
      return `${active.length} active. ${quiet} ${quiet === 1 ? 'is' : 'are'} sitting quiet.`;
    }
    return `${active.length} active. Pipeline empty — nudge the team.`;
  })();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className={H1} style={TITLE_FONT}>
          Realtors
        </h1>
        <p className="text-lg text-muted-foreground" style={TITLE_FONT}>
          {subtitle}
        </p>
      </header>

      {members.length === 0 ? (
        <Card>
          <CardContent className="px-5 py-10 text-center">
            <Link
              href="/broker/invitations"
              className="text-sm text-primary font-medium hover:underline underline-offset-2 inline-block"
            >
              Invite realtors →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <RealtorsClient realtors={realtors} />
      )}
    </div>
  );
}
