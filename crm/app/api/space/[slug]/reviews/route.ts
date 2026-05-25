import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

type Params = { params: Promise<{ slug: string }> };

type StatusFilter = 'open' | 'approved' | 'closed' | 'all';

type ReviewRow = {
  id: string;
  dealId: string;
  status: 'open' | 'approved' | 'closed';
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedNote: string | null;
  requestingUserId: string;
  brokerageId: string;
};

type DealLite = { id: string; title: string | null; value: number | null };

/**
 * GET /api/space/[slug]/reviews?status=open|approved|closed|all
 *
 * Realtor-facing list of the caller's own review requests. Default status =
 * 'all' (the dedicated /reviews page shows tabs for each state). Scoped to
 *   - requestingUserId === caller's User.id (so agents only see their own)
 *   - brokerageId === the Space's brokerageId
 *
 * Sort: open first, then createdAt DESC within each group. Limit 200.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { slug } = await params;

  const authResult = await requireSpaceOwner(slug);
  if (authResult instanceof NextResponse) return authResult;
  const { userId: clerkId, space } = authResult;

  // Space must belong to a brokerage for reviews to be meaningful.
  if (!space.brokerageId) {
    return NextResponse.json([]);
  }

  // Resolve the caller's DB User.id — requireSpaceOwner returns the Clerk id.
  const { data: dbUser, error: userErr } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', clerkId)
    .maybeSingle<{ id: string }>();
  if (userErr) {
    logger.error('[space/reviews/GET] user lookup failed', { clerkId }, userErr);
    return NextResponse.json({ error: 'User not found' }, { status: 500 });
  }
  if (!dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const url = new URL(req.url);
  const statusParam = (url.searchParams.get('status') ?? 'all').toLowerCase();
  const VALID: StatusFilter[] = ['open', 'approved', 'closed', 'all'];
  if (!VALID.includes(statusParam as StatusFilter)) {
    return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
  }
  const statusFilter = statusParam as StatusFilter;

  let query = supabase
    .from('DealReviewRequest')
    .select(
      'id, dealId, status, reason, createdAt, resolvedAt, resolvedNote, requestingUserId, brokerageId',
    )
    .eq('requestingUserId', dbUser.id)
    .eq('brokerageId', space.brokerageId);

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data: rowsData, error: rowsErr } = await query
    .order('createdAt', { ascending: false })
    .limit(200);

  if (rowsErr) {
    logger.error(
      '[space/reviews/GET] list failed',
      { slug, brokerageId: space.brokerageId },
      rowsErr,
    );
    return NextResponse.json({ error: 'Failed to load reviews' }, { status: 500 });
  }

  const rows = (rowsData ?? []) as ReviewRow[];
  if (rows.length === 0) return NextResponse.json([]);

  const reviewIds = rows.map((r) => r.id);
  const dealIds = Array.from(new Set(rows.map((r) => r.dealId)));

  const [dealsRes, commentsRes] = await Promise.all([
    supabase.from('Deal').select('id, title, value').in('id', dealIds),
    supabase
      .from('DealReviewComment')
      .select('id, reviewRequestId')
      .in('reviewRequestId', reviewIds),
  ]);

  if (dealsRes.error) {
    logger.error('[space/reviews/GET] deal fetch failed', { slug }, dealsRes.error);
    return NextResponse.json({ error: 'Failed to load reviews' }, { status: 500 });
  }
  if (commentsRes.error) {
    logger.error('[space/reviews/GET] comment count failed', { slug }, commentsRes.error);
    return NextResponse.json({ error: 'Failed to load reviews' }, { status: 500 });
  }

  const dealsById = new Map<string, DealLite>(
    ((dealsRes.data ?? []) as DealLite[]).map((d) => [d.id, d]),
  );
  const commentCountByReview = new Map<string, number>();
  for (const c of (commentsRes.data ?? []) as { id: string; reviewRequestId: string }[]) {
    commentCountByReview.set(
      c.reviewRequestId,
      (commentCountByReview.get(c.reviewRequestId) ?? 0) + 1,
    );
  }

  const shaped = rows.map((r) => {
    const deal = dealsById.get(r.dealId) ?? null;
    return {
      id: r.id,
      dealId: r.dealId,
      status: r.status,
      reason: r.reason,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      resolvedNote: r.resolvedNote,
      deal: {
        id: deal?.id ?? r.dealId,
        title: deal?.title ?? null,
        value: deal?.value ?? null,
      },
      commentCount: commentCountByReview.get(r.id) ?? 0,
    };
  });

  // Sort: open first, then approved, then closed. Within a group, keep the
  // createdAt DESC order from the query above.
  const STATUS_RANK: Record<ReviewRow['status'], number> = {
    open: 0,
    approved: 1,
    closed: 2,
  };
  shaped.sort((a, b) => {
    const ra = STATUS_RANK[a.status as ReviewRow['status']] ?? 99;
    const rb = STATUS_RANK[b.status as ReviewRow['status']] ?? 99;
    if (ra !== rb) return ra - rb;
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });

  return NextResponse.json(shaped);
}
