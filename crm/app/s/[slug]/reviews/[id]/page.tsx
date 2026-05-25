import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { DetailClient, type ReviewComment, type ReviewDetail } from './detail-client';

interface PageProps {
  params: Promise<{ slug: string; id: string }>;
}

export default async function RealtorReviewDetailPage({ params }: PageProps) {
  const { slug, id } = await params;

  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const { data: dbUserRow } = await supabase
    .from('User')
    .select('id, status')
    .eq('clerkId', clerkId)
    .maybeSingle();
  if (!dbUserRow) redirect('/setup');
  // Same hard-stop as the list page. requireAuth handles this for API
  // routes; server-only pages must check it themselves.
  if ((dbUserRow as { status?: string }).status === 'offboarded') redirect('/offboarded');
  const userId = (dbUserRow as { id: string }).id;

  // 1. Load the review. 404 if it doesn't exist, belongs to a different user,
  //    or belongs to a different brokerage — we must not leak existence.
  type ReviewRow = {
    id: string;
    dealId: string;
    brokerageId: string;
    status: 'open' | 'approved' | 'closed';
    reason: string;
    createdAt: string;
    resolvedAt: string | null;
    resolvedNote: string | null;
    resolvedByUserId: string | null;
    requestingUserId: string;
  };

  const { data: reviewRow } = await supabase
    .from('DealReviewRequest')
    .select(
      'id, dealId, brokerageId, status, reason, createdAt, resolvedAt, resolvedNote, resolvedByUserId, requestingUserId',
    )
    .eq('id', id)
    .maybeSingle();

  const review = reviewRow as ReviewRow | null;

  if (
    !review ||
    review.requestingUserId !== userId ||
    review.brokerageId !== space.brokerageId
  ) {
    notFound();
  }

  // 2. Hydrate joins in parallel: deal, comments, resolver (if any).
  type DealLite = { id: string; title: string | null; value: number | null };
  type UserLite = { id: string; name: string | null };
  type CommentRaw = {
    id: string;
    reviewRequestId: string;
    authorUserId: string;
    body: string;
    createdAt: string;
  };

  const [dealRes, commentsRes, resolvedByRes] = await Promise.all([
    supabase
      .from('Deal')
      .select('id, title, value')
      .eq('id', review.dealId)
      .maybeSingle(),
    supabase
      .from('DealReviewComment')
      .select('id, reviewRequestId, authorUserId, body, createdAt')
      .eq('reviewRequestId', id)
      .order('createdAt', { ascending: true }),
    review.resolvedByUserId
      ? supabase
          .from('User')
          .select('id, name')
          .eq('id', review.resolvedByUserId)
          .maybeSingle()
      : Promise.resolve({ data: null as UserLite | null }),
  ]);

  const deal = (dealRes.data ?? null) as DealLite | null;
  const resolvedByUser = (resolvedByRes.data ?? null) as UserLite | null;

  // 3. Resolve comment author identities in a single User lookup.
  const rawComments = (commentsRes.data ?? []) as CommentRaw[];
  const authorIds = Array.from(new Set(rawComments.map((c) => c.authorUserId)));
  const authorsRes = authorIds.length
    ? await supabase.from('User').select('id, name').in('id', authorIds)
    : { data: [] as UserLite[] };
  const authors = (authorsRes.data ?? []) as UserLite[];
  const authorMap = new Map<string, UserLite>(authors.map((a) => [a.id, a]));

  const comments: ReviewComment[] = rawComments.map((c) => ({
    id: c.id,
    authorUser: {
      id: c.authorUserId,
      name: authorMap.get(c.authorUserId)?.name ?? null,
    },
    body: c.body,
    createdAt: c.createdAt,
  }));

  const detail: ReviewDetail = {
    id: review.id,
    dealId: review.dealId,
    status: review.status,
    reason: review.reason,
    createdAt: review.createdAt,
    resolvedAt: review.resolvedAt,
    resolvedNote: review.resolvedNote,
    deal: {
      id: review.dealId,
      title: deal?.title ?? null,
      value: deal?.value ?? null,
    },
    resolvedByUser: resolvedByUser
      ? { id: resolvedByUser.id, name: resolvedByUser.name ?? null }
      : null,
    // The caller is always the requester on this page — surface their id so
    // the client can tag self-authored comments in the thread.
    viewerUserId: userId,
  };

  return (
    <DetailClient slug={slug} review={detail} comments={comments} />
  );
}
