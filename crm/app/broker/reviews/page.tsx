import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { ReviewsClient, type ReviewRow } from './reviews-client';

// Server component: fetch the open queue directly via supabase (bypass API
// round-trip), then hand off to the client for tab-switching.
//
// Use getBrokerContext (not requireBroker) so non-brokers get a clean
// redirect instead of an uncaught throw — matches app/broker/members/page.tsx.
export default async function BrokerReviewsPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  // 1. Pull open review requests for this brokerage, newest-first. Other tabs
  //    fetch on demand via /api/broker/reviews?status=X.
  const { data: rawReviews } = await supabase
    .from('DealReviewRequest')
    .select('id, dealId, status, reason, createdAt, resolvedAt, resolvedNote, requestingUserId')
    .eq('brokerageId', ctx.brokerage.id)
    .eq('status', 'open')
    .order('createdAt', { ascending: false });

  const reviews = (rawReviews ?? []) as Array<{
    id: string;
    dealId: string;
    status: string;
    reason: string;
    createdAt: string;
    resolvedAt: string | null;
    resolvedNote: string | null;
    requestingUserId: string;
  }>;

  const reviewIds = reviews.map((r) => r.id);
  const userIds = Array.from(new Set(reviews.map((r) => r.requestingUserId).filter(Boolean)));
  const dealIds = Array.from(new Set(reviews.map((r) => r.dealId).filter(Boolean)));

  // 2. Fan-out the joins in parallel — users, deals, and comment counts.
  //    Comment counts are aggregated client-side from a flat select because
  //    supabase-js lacks a clean GROUP BY for count(*).
  type UserRow = { id: string; name: string | null; email: string | null };
  type DealRow = { id: string; title: string | null; value: number | null; spaceId: string | null };
  type CommentRow = { reviewRequestId: string };

  const [usersRes, dealsRes, commentsRes] = await Promise.all([
    userIds.length
      ? supabase.from('User').select('id, name, email').in('id', userIds)
      : Promise.resolve({ data: [] as UserRow[] }),
    dealIds.length
      ? supabase.from('Deal').select('id, title, value, spaceId').in('id', dealIds)
      : Promise.resolve({ data: [] as DealRow[] }),
    reviewIds.length
      ? supabase.from('DealReviewComment').select('reviewRequestId').in('reviewRequestId', reviewIds)
      : Promise.resolve({ data: [] as CommentRow[] }),
  ]);

  const usersData = (usersRes.data ?? []) as UserRow[];
  const dealsData = (dealsRes.data ?? []) as DealRow[];
  const commentsData = (commentsRes.data ?? []) as CommentRow[];

  const userMap = new Map<string, UserRow>(usersData.map((u) => [u.id, u]));

  // Deals → Space slug (deals belong to a Space, which carries the public slug).
  const spaceIds = Array.from(
    new Set(dealsData.map((d) => d.spaceId).filter((id): id is string => !!id))
  );
  const spaceRes = spaceIds.length
    ? await supabase.from('Space').select('id, slug').in('id', spaceIds)
    : { data: [] as Array<{ id: string; slug: string | null }> };
  const spacesData = (spaceRes.data ?? []) as Array<{ id: string; slug: string | null }>;
  const spaceMap = new Map<string, string | null>(spacesData.map((s) => [s.id, s.slug]));
  const dealMap = new Map<string, DealRow & { spaceSlug: string | null }>(
    dealsData.map((d) => [d.id, { ...d, spaceSlug: d.spaceId ? spaceMap.get(d.spaceId) ?? null : null }])
  );

  const commentCounts = new Map<string, number>();
  for (const c of commentsData) {
    commentCounts.set(c.reviewRequestId, (commentCounts.get(c.reviewRequestId) ?? 0) + 1);
  }

  const initialReviews: ReviewRow[] = reviews.map((r) => {
    const user = userMap.get(r.requestingUserId);
    const deal = dealMap.get(r.dealId);
    return {
      id: r.id,
      dealId: r.dealId,
      status: r.status as ReviewRow['status'],
      reason: r.reason,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      resolvedNote: r.resolvedNote,
      requestingUser: {
        id: r.requestingUserId,
        name: user?.name ?? null,
        email: user?.email ?? null,
      },
      deal: {
        id: r.dealId,
        title: deal?.title ?? null,
        value: deal?.value ?? null,
        spaceSlug: deal?.spaceSlug ?? null,
      },
      commentCount: commentCounts.get(r.id) ?? 0,
    };
  });

  // Headline status — calm, factual. Mirrors the broker overview pattern
  // (greeting + serif h1 + one-sentence status).
  const openCount = initialReviews.length;
  const statusSentence = (() => {
    if (openCount === 0) {
      return "Nothing flagged. Quiet day.";
    }
    return `${openCount} ${openCount === 1 ? 'deal' : 'deals'} waiting for your sign-off.`;
  })();

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <header className="space-y-1.5">
        <p className="text-sm text-muted-foreground">Reviews.</p>
        <h1
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          Deals flagged for you
        </h1>
        <p className="text-sm text-muted-foreground">{statusSentence}</p>
      </header>
      <ReviewsClient
        initialReviews={initialReviews}
        initialOpenCount={openCount}
        role={ctx.membership.role}
        brokerageName={ctx.brokerage.name}
      />
    </div>
  );
}
