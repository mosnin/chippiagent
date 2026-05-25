import { supabase } from '@/lib/supabase';
import { isPlatformAdmin } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { BroadcastClient, type SegmentKey, type PastBroadcast } from './broadcast-client';

export const metadata = { title: 'Broadcast — Admin — Chippi' };

const SUBSCRIPTION_SEGMENTS: Record<string, string> = {
  trial: 'trialing',
  active: 'active',
  past_due: 'past_due',
  canceled: 'canceled',
};

async function countSegment(segment: SegmentKey): Promise<number> {
  if (segment === 'all') {
    const { count } = await supabase
      .from('User')
      .select('*', { count: 'exact', head: true });
    return count ?? 0;
  }
  if (segment === 'onboarded' || segment === 'not_onboarded') {
    const { count } = await supabase
      .from('User')
      .select('*', { count: 'exact', head: true })
      .eq('onboard', segment === 'onboarded');
    return count ?? 0;
  }
  if (segment in SUBSCRIPTION_SEGMENTS) {
    const { count } = await supabase
      .from('Space')
      .select('*', { count: 'exact', head: true })
      .eq('stripeSubscriptionStatus', SUBSCRIPTION_SEGMENTS[segment]);
    return count ?? 0;
  }
  if (segment === 'no_workspace') {
    const [{ count: totalUsers }, { count: totalSpaces }] = await Promise.all([
      supabase.from('User').select('*', { count: 'exact', head: true }),
      supabase.from('Space').select('*', { count: 'exact', head: true }),
    ]);
    return Math.max(0, (totalUsers ?? 0) - (totalSpaces ?? 0));
  }
  return 0;
}

export default async function AdminBroadcastPage() {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect('/');

  const segmentKeys: SegmentKey[] = [
    'all',
    'onboarded',
    'not_onboarded',
    'trial',
    'active',
    'past_due',
    'canceled',
    'no_workspace',
  ];

  const [countsArr, pastRes] = await Promise.all([
    Promise.all(segmentKeys.map((k) => countSegment(k))),
    supabase
      .from('EmailBroadcast')
      .select('id, subject, segment, recipientCount, sentCount, failedCount, sentBy, createdAt')
      .order('createdAt', { ascending: false })
      .limit(20),
  ]);

  const counts: Record<SegmentKey, number> = segmentKeys.reduce(
    (acc, key, i) => {
      acc[key] = countsArr[i];
      return acc;
    },
    {} as Record<SegmentKey, number>,
  );

  const pastBroadcasts = ((pastRes.data ?? []) as PastBroadcast[]).map((b) => ({
    id: b.id,
    subject: b.subject,
    segment: b.segment,
    recipientCount: b.recipientCount,
    sentCount: b.sentCount,
    failedCount: b.failedCount,
    sentBy: b.sentBy,
    createdAt: typeof b.createdAt === 'string' ? b.createdAt : String(b.createdAt),
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Email broadcast</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Send an email to a segment of users. Limited to 3 broadcasts per hour.
        </p>
      </div>
      <BroadcastClient counts={counts} pastBroadcasts={pastBroadcasts} />
    </div>
  );
}
