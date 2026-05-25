import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { notFound, redirect } from 'next/navigation';
import type { ReviewRow } from '../reviews-client';
import { ReviewDetailClient, type ReviewComment } from './review-detail-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BrokerReviewDetailPage({ params }: PageProps) {
  const { id } = await params;

  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  // 1. Load the review request. 404 if it doesn't exist OR belongs to a
  //    different brokerage — we must not leak existence across brokerages.
  const { data: reviewRow } = await supabase
    .from('DealReviewRequest')
    .select(
      'id, dealId, brokerageId, status, reason, createdAt, resolvedAt, resolvedNote, resolvedByUserId, requestingUserId'
    )
    .eq('id', id)
    .maybeSingle();

  if (!reviewRow || reviewRow.brokerageId !== ctx.brokerage.id) {
    notFound();
  }

  // 2. Hydrate joins + comments in parallel.
  type UserLite = { id: string; name: string | null; email: string | null };
  type DealLite = { id: string; title: string | null; value: number | null; spaceId: string | null };
  type CommentRaw = {
    id: string;
    reviewRequestId: string;
    authorUserId: string;
    body: string;
    createdAt: string;
  };
  type AuthorLite = { id: string; name: string | null };

  const [userRes, dealRes, commentsRes, resolvedByRes] = await Promise.all([
    supabase
      .from('User')
      .select('id, name, email')
      .eq('id', reviewRow.requestingUserId)
      .maybeSingle(),
    supabase
      .from('Deal')
      .select('id, title, value, spaceId')
      .eq('id', reviewRow.dealId)
      .maybeSingle(),
    supabase
      .from('DealReviewComment')
      .select('id, reviewRequestId, authorUserId, body, createdAt')
      .eq('reviewRequestId', id)
      .order('createdAt', { ascending: true }),
    reviewRow.resolvedByUserId
      ? supabase
          .from('User')
          .select('id, name, email')
          .eq('id', reviewRow.resolvedByUserId)
          .maybeSingle()
      : Promise.resolve({ data: null as UserLite | null }),
  ]);

  const requestingUser = (userRes.data ?? null) as UserLite | null;
  const deal = (dealRes.data ?? null) as DealLite | null;
  const resolvedByUser = (resolvedByRes.data ?? null) as UserLite | null;

  const spaceRes = deal?.spaceId
    ? await supabase.from('Space').select('slug').eq('id', deal.spaceId).maybeSingle()
    : { data: null as { slug: string | null } | null };
  const space = (spaceRes.data ?? null) as { slug: string | null } | null;

  // 3. Resolve comment author identities with a single User lookup.
  const rawComments = (commentsRes.data ?? []) as CommentRaw[];
  const authorIds = Array.from(new Set(rawComments.map((c) => c.authorUserId)));
  const authorsRes = authorIds.length
    ? await supabase.from('User').select('id, name').in('id', authorIds)
    : { data: [] as AuthorLite[] };
  const authors = (authorsRes.data ?? []) as AuthorLite[];
  const authorMap = new Map<string, AuthorLite>(authors.map((a) => [a.id, a]));

  const comments: ReviewComment[] = rawComments.map((c) => ({
    id: c.id,
    authorUser: {
      id: c.authorUserId,
      name: authorMap.get(c.authorUserId)?.name ?? null,
    },
    body: c.body,
    createdAt: c.createdAt,
  }));

  const review: ReviewRow & {
    resolvedByUser: { id: string; name: string | null } | null;
  } = {
    id: reviewRow.id,
    dealId: reviewRow.dealId,
    status: reviewRow.status as ReviewRow['status'],
    reason: reviewRow.reason,
    createdAt: reviewRow.createdAt,
    resolvedAt: reviewRow.resolvedAt,
    resolvedNote: reviewRow.resolvedNote,
    requestingUser: {
      id: reviewRow.requestingUserId,
      name: requestingUser?.name ?? null,
      email: requestingUser?.email ?? null,
    },
    deal: {
      id: reviewRow.dealId,
      title: deal?.title ?? null,
      value: deal?.value ?? null,
      spaceSlug: space?.slug ?? null,
    },
    commentCount: comments.length,
    resolvedByUser: resolvedByUser
      ? { id: resolvedByUser.id, name: resolvedByUser.name ?? null }
      : null,
  };

  return (
    <ReviewDetailClient review={review} comments={comments} role={ctx.membership.role} />
  );
}
