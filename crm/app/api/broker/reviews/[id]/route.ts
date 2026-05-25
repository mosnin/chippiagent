import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getBrokerMemberContext, requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { logger } from '@/lib/logger';

type Params = { params: Promise<{ id: string }> };

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

type UserLite = { id: string; name: string | null; email: string | null };
type DealLite = { id: string; title: string | null; value: number | null; spaceId: string };
type SpaceLite = { id: string; slug: string };

type ShapedReview = {
  id: string;
  dealId: string;
  status: 'open' | 'approved' | 'closed';
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedNote: string | null;
  requestingUser: { id: string; name: string | null; email: string | null };
  deal: { id: string; title: string | null; value: number | null; spaceSlug: string | null };
  comments: Array<{
    id: string;
    authorUser: { id: string; name: string | null };
    body: string;
    createdAt: string;
  }>;
};

async function shapeReview(row: ReviewRow): Promise<ShapedReview> {
  const [userRes, dealRes, commentsRes] = await Promise.all([
    supabase
      .from('User')
      .select('id, name, email')
      .eq('id', row.requestingUserId)
      .maybeSingle<UserLite>(),
    supabase
      .from('Deal')
      .select('id, title, value, spaceId')
      .eq('id', row.dealId)
      .maybeSingle<DealLite>(),
    supabase
      .from('DealReviewComment')
      .select('id, reviewRequestId, authorUserId, body, createdAt')
      .eq('reviewRequestId', row.id)
      .order('createdAt', { ascending: true }),
  ]);

  if (userRes.error) throw userRes.error;
  if (dealRes.error) throw dealRes.error;
  if (commentsRes.error) throw commentsRes.error;

  const deal = dealRes.data ?? null;
  const comments = (commentsRes.data ?? []) as CommentRow[];
  const authorIds = Array.from(new Set(comments.map((c) => c.authorUserId)));

  // Parallelise the second wave: Space (needs deal.spaceId) and comment
  // authors (needs comments[]). These two queries depend on different
  // earlier queries, so fire them concurrently instead of sequentially —
  // saves one round-trip on the detail page's initial render.
  const [spaceRes, authorsRes] = await Promise.all([
    deal
      ? supabase
          .from('Space')
          .select('id, slug')
          .eq('id', deal.spaceId)
          .maybeSingle<SpaceLite>()
      : Promise.resolve({ data: null, error: null } as { data: SpaceLite | null; error: null }),
    authorIds.length
      ? supabase.from('User').select('id, name').in('id', authorIds)
      : Promise.resolve({ data: [], error: null } as {
          data: Array<{ id: string; name: string | null }>;
          error: null;
        }),
  ]);
  if (spaceRes.error) throw spaceRes.error;
  if (authorsRes.error) throw authorsRes.error;
  const space: SpaceLite | null = spaceRes.data ?? null;
  const authorsById = new Map(
    ((authorsRes.data ?? []) as { id: string; name: string | null }[]).map((u) => [u.id, u]),
  );

  return {
    id: row.id,
    dealId: row.dealId,
    status: row.status,
    reason: row.reason,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    resolvedNote: row.resolvedNote,
    requestingUser: {
      id: userRes.data?.id ?? row.requestingUserId,
      name: userRes.data?.name ?? null,
      email: userRes.data?.email ?? null,
    },
    deal: {
      id: deal?.id ?? row.dealId,
      title: deal?.title ?? null,
      value: deal?.value ?? null,
      spaceSlug: space?.slug ?? null,
    },
    comments: comments.map((c) => ({
      id: c.id,
      authorUser: {
        id: authorsById.get(c.authorUserId)?.id ?? c.authorUserId,
        name: authorsById.get(c.authorUserId)?.name ?? null,
      },
      body: c.body,
      createdAt: c.createdAt,
    })),
  };
}

/**
 * GET /api/broker/reviews/[id]
 * Returns a single review (scoped to the caller's brokerage) plus its
 * comments in chronological order. Any broker member role may read.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const ctx = await getBrokerMemberContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: reviewId } = await params;

  const { data: row, error } = await supabase
    .from('DealReviewRequest')
    .select(
      'id, dealId, status, reason, createdAt, resolvedAt, resolvedByUserId, resolvedNote, requestingUserId, brokerageId',
    )
    .eq('id', reviewId)
    .eq('brokerageId', ctx.brokerage.id)
    .maybeSingle<ReviewRow>();

  if (error) {
    logger.error(
      '[broker/reviews/GET] load failed',
      { reviewId, brokerageId: ctx.brokerage.id },
      error,
    );
    return NextResponse.json({ error: 'Failed to load review' }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  }

  try {
    const shaped = await shapeReview(row);
    return NextResponse.json(shaped);
  } catch (err) {
    logger.error('[broker/reviews/GET] shape failed', { reviewId }, err);
    return NextResponse.json({ error: 'Failed to load review' }, { status: 500 });
  }
}

/**
 * PATCH /api/broker/reviews/[id]
 * Body: { status: 'approved' | 'closed'; resolvedNote?: string (max 2000) }
 * Only broker_owner/broker_admin may resolve. Already-resolved rows return 409.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { userId: clerkId } = await auth();

  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Role gate — requireBroker already restricts to broker_owner/broker_admin,
  // but we double-check defensively so this route's contract doesn't silently
  // widen if requireBroker's behavior ever changes.
  if (ctx.membership.role !== 'broker_owner' && ctx.membership.role !== 'broker_admin') {
    return NextResponse.json(
      { error: 'Only the owner or admins can resolve reviews' },
      { status: 403 },
    );
  }

  const { id: reviewId } = await params;

  let body: { status?: unknown; resolvedNote?: unknown };
  try {
    body = (await req.json()) as { status?: unknown; resolvedNote?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const nextStatus = body?.status;
  if (nextStatus !== 'approved' && nextStatus !== 'closed') {
    return NextResponse.json(
      { error: 'status must be "approved" or "closed"' },
      { status: 400 },
    );
  }

  let resolvedNote: string | null = null;
  if (body.resolvedNote !== undefined && body.resolvedNote !== null) {
    if (typeof body.resolvedNote !== 'string') {
      return NextResponse.json({ error: 'resolvedNote must be a string' }, { status: 400 });
    }
    if (body.resolvedNote.length > 2000) {
      return NextResponse.json({ error: 'resolvedNote exceeds 2000 chars' }, { status: 400 });
    }
    resolvedNote = body.resolvedNote;
  }

  const { data: current, error: loadErr } = await supabase
    .from('DealReviewRequest')
    .select(
      'id, dealId, status, reason, createdAt, resolvedAt, resolvedByUserId, resolvedNote, requestingUserId, brokerageId',
    )
    .eq('id', reviewId)
    .eq('brokerageId', ctx.brokerage.id)
    .maybeSingle<ReviewRow>();

  if (loadErr) {
    logger.error(
      '[broker/reviews/PATCH] load failed',
      { reviewId, brokerageId: ctx.brokerage.id },
      loadErr,
    );
    return NextResponse.json({ error: 'Failed to load review' }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  }

  if (current.status !== 'open') {
    return NextResponse.json(
      { error: 'Review has already been resolved' },
      { status: 409 },
    );
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from('DealReviewRequest')
    .update({
      status: nextStatus,
      resolvedAt: nowIso,
      resolvedByUserId: ctx.dbUserId,
      resolvedNote,
    })
    .eq('id', reviewId)
    .eq('brokerageId', ctx.brokerage.id)
    .eq('status', 'open') // TOCTOU guard — only resolve if still open
    .select(
      'id, dealId, status, reason, createdAt, resolvedAt, resolvedByUserId, resolvedNote, requestingUserId, brokerageId',
    )
    .maybeSingle<ReviewRow>();

  if (updateErr) {
    logger.error('[broker/reviews/PATCH] update failed', { reviewId }, updateErr);
    return NextResponse.json({ error: 'Failed to update review' }, { status: 500 });
  }
  if (!updated) {
    // Another resolver won the race. Surface as 409 — consistent with the
    // "already resolved" case above.
    return NextResponse.json(
      { error: 'Review has already been resolved' },
      { status: 409 },
    );
  }

  void audit({
    actorClerkId: clerkId ?? null,
    action: 'UPDATE',
    resource: 'DealReviewRequest',
    resourceId: reviewId,
    req,
    metadata: {
      brokerageId: ctx.brokerage.id,
      previousStatus: current.status,
      newStatus: nextStatus,
      dealId: current.dealId,
    },
  });

  try {
    const shaped = await shapeReview(updated);
    return NextResponse.json(shaped);
  } catch (err) {
    logger.error('[broker/reviews/PATCH] shape failed', { reviewId }, err);
    return NextResponse.json({ error: 'Failed to load updated review' }, { status: 500 });
  }
}
