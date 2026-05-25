import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

type Params = { params: Promise<{ slug: string; id: string }> };

type ReviewRow = {
  id: string;
  dealId: string;
  status: 'open' | 'approved' | 'closed';
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  resolvedNote: string | null;
  requestingUserId: string;
  brokerageId: string;
};

type CommentRow = {
  id: string;
  reviewRequestId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
};

type UserLite = { id: string; name: string | null };
type DealLite = { id: string; title: string | null; value: number | null };

/**
 * GET /api/space/[slug]/reviews/[id]
 *
 * Agent-side detail endpoint. Authorized iff
 *   - caller owns the space (via requireSpaceOwner), AND
 *   - the review row's requestingUserId matches the caller's DB User.id.
 *
 * Any other case returns 404 so we don't leak existence of reviews the caller
 * doesn't own, even within the same brokerage.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { slug, id: reviewId } = await params;

  const authResult = await requireSpaceOwner(slug);
  if (authResult instanceof NextResponse) return authResult;
  const { userId: clerkId, space } = authResult;

  if (!space.brokerageId) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  }

  const { data: dbUser, error: userErr } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', clerkId)
    .maybeSingle<{ id: string }>();
  if (userErr) {
    logger.error('[space/reviews/detail/GET] user lookup failed', { clerkId }, userErr);
    return NextResponse.json({ error: 'User not found' }, { status: 500 });
  }
  if (!dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { data: row, error } = await supabase
    .from('DealReviewRequest')
    .select(
      'id, dealId, status, reason, createdAt, resolvedAt, resolvedByUserId, resolvedNote, requestingUserId, brokerageId',
    )
    .eq('id', reviewId)
    .maybeSingle<ReviewRow>();

  if (error) {
    logger.error('[space/reviews/detail/GET] load failed', { reviewId }, error);
    return NextResponse.json({ error: 'Failed to load review' }, { status: 500 });
  }
  // Ownership gate — 404 for anything the caller doesn't own. We check both
  // requestingUserId and brokerageId; the latter defends against a freak
  // cross-brokerage collision where the agent changed brokerages.
  if (
    !row ||
    row.requestingUserId !== dbUser.id ||
    row.brokerageId !== space.brokerageId
  ) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  }

  const [dealRes, commentsRes, resolvedByRes] = await Promise.all([
    supabase
      .from('Deal')
      .select('id, title, value')
      .eq('id', row.dealId)
      .maybeSingle<DealLite>(),
    supabase
      .from('DealReviewComment')
      .select('id, reviewRequestId, authorUserId, body, createdAt')
      .eq('reviewRequestId', row.id)
      .order('createdAt', { ascending: true }),
    row.resolvedByUserId
      ? supabase
          .from('User')
          .select('id, name')
          .eq('id', row.resolvedByUserId)
          .maybeSingle<UserLite>()
      : Promise.resolve({ data: null, error: null } as {
          data: UserLite | null;
          error: null;
        }),
  ]);

  if (dealRes.error) {
    logger.error('[space/reviews/detail/GET] deal fetch failed', { reviewId }, dealRes.error);
    return NextResponse.json({ error: 'Failed to load review' }, { status: 500 });
  }
  if (commentsRes.error) {
    logger.error(
      '[space/reviews/detail/GET] comment fetch failed',
      { reviewId },
      commentsRes.error,
    );
    return NextResponse.json({ error: 'Failed to load review' }, { status: 500 });
  }
  if (resolvedByRes.error) {
    logger.error(
      '[space/reviews/detail/GET] resolver fetch failed',
      { reviewId },
      resolvedByRes.error,
    );
    return NextResponse.json({ error: 'Failed to load review' }, { status: 500 });
  }

  const rawComments = (commentsRes.data ?? []) as CommentRow[];
  const authorIds = Array.from(new Set(rawComments.map((c) => c.authorUserId)));
  const authorsRes = authorIds.length
    ? await supabase.from('User').select('id, name').in('id', authorIds)
    : { data: [] as UserLite[], error: null };
  if (authorsRes.error) {
    logger.error(
      '[space/reviews/detail/GET] authors fetch failed',
      { reviewId },
      authorsRes.error,
    );
    return NextResponse.json({ error: 'Failed to load review' }, { status: 500 });
  }

  const authorsById = new Map<string, UserLite>(
    ((authorsRes.data ?? []) as UserLite[]).map((u) => [u.id, u]),
  );

  const deal = dealRes.data ?? null;
  const resolvedByUser = resolvedByRes.data ?? null;

  return NextResponse.json({
    id: row.id,
    dealId: row.dealId,
    status: row.status,
    reason: row.reason,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    resolvedNote: row.resolvedNote,
    deal: {
      id: deal?.id ?? row.dealId,
      title: deal?.title ?? null,
      value: deal?.value ?? null,
    },
    resolvedByUser: resolvedByUser
      ? { id: resolvedByUser.id, name: resolvedByUser.name ?? null }
      : null,
    comments: rawComments.map((c) => ({
      id: c.id,
      body: c.body,
      authorUser: {
        id: authorsById.get(c.authorUserId)?.id ?? c.authorUserId,
        name: authorsById.get(c.authorUserId)?.name ?? null,
      },
      createdAt: c.createdAt,
    })),
  });
}
