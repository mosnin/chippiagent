import { NextRequest, NextResponse } from 'next/server';
import { getBrokerMemberContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

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

type UserLite = { id: string; name: string | null; email: string | null };
type DealLite = { id: string; title: string | null; value: number | null; spaceId: string };
type SpaceLite = { id: string; slug: string };

/**
 * GET /api/broker/reviews?status=open|approved|closed|all
 * Default status = 'open'. Returns up to 200 rows belonging to this brokerage.
 * Sort: open first (createdAt DESC), then other statuses.
 */
export async function GET(req: NextRequest) {
  const ctx = await getBrokerMemberContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const statusParam = (url.searchParams.get('status') ?? 'open').toLowerCase();
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
    .eq('brokerageId', ctx.brokerage.id);

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  // We'll do the final two-key sort in JS since Supabase's order needs exact
  // columns and "open first then by status" isn't a pure column order. Start
  // by getting rows in createdAt DESC and cap at 200.
  const { data: rowsData, error: rowsErr } = await query
    .order('createdAt', { ascending: false })
    .limit(200);

  if (rowsErr) {
    logger.error('[broker/reviews/GET] list failed', { brokerageId: ctx.brokerage.id }, rowsErr);
    return NextResponse.json({ error: 'Failed to load reviews' }, { status: 500 });
  }

  const rows = (rowsData ?? []) as ReviewRow[];
  if (rows.length === 0) return NextResponse.json([]);

  const reviewIds = rows.map((r) => r.id);
  const userIds = Array.from(new Set(rows.map((r) => r.requestingUserId)));
  const dealIds = Array.from(new Set(rows.map((r) => r.dealId)));

  // Fetch requesting users, deals, and comment counts in parallel.
  const [usersRes, dealsRes, commentsRes] = await Promise.all([
    supabase.from('User').select('id, name, email').in('id', userIds),
    supabase.from('Deal').select('id, title, value, spaceId').in('id', dealIds),
    supabase.from('DealReviewComment').select('id, reviewRequestId').in('reviewRequestId', reviewIds),
  ]);

  if (usersRes.error) {
    logger.error('[broker/reviews/GET] user fetch failed', { brokerageId: ctx.brokerage.id }, usersRes.error);
    return NextResponse.json({ error: 'Failed to load reviews' }, { status: 500 });
  }
  if (dealsRes.error) {
    logger.error('[broker/reviews/GET] deal fetch failed', { brokerageId: ctx.brokerage.id }, dealsRes.error);
    return NextResponse.json({ error: 'Failed to load reviews' }, { status: 500 });
  }
  if (commentsRes.error) {
    logger.error('[broker/reviews/GET] comment count failed', { brokerageId: ctx.brokerage.id }, commentsRes.error);
    return NextResponse.json({ error: 'Failed to load reviews' }, { status: 500 });
  }

  const deals = (dealsRes.data ?? []) as DealLite[];
  const spaceIds = Array.from(new Set(deals.map((d) => d.spaceId)));
  const spacesRes = spaceIds.length
    ? await supabase.from('Space').select('id, slug').in('id', spaceIds)
    : { data: [] as SpaceLite[], error: null };
  if (spacesRes.error) {
    logger.error('[broker/reviews/GET] space fetch failed', { brokerageId: ctx.brokerage.id }, spacesRes.error);
    return NextResponse.json({ error: 'Failed to load reviews' }, { status: 500 });
  }

  const usersById = new Map<string, UserLite>(((usersRes.data ?? []) as UserLite[]).map((u) => [u.id, u]));
  const dealsById = new Map<string, DealLite>(deals.map((d) => [d.id, d]));
  const spacesById = new Map<string, SpaceLite>(
    ((spacesRes.data ?? []) as SpaceLite[]).map((s) => [s.id, s]),
  );
  const commentCountByReview = new Map<string, number>();
  for (const c of (commentsRes.data ?? []) as { id: string; reviewRequestId: string }[]) {
    commentCountByReview.set(c.reviewRequestId, (commentCountByReview.get(c.reviewRequestId) ?? 0) + 1);
  }

  const shaped = rows.map((r) => {
    const user = usersById.get(r.requestingUserId) ?? null;
    const deal = dealsById.get(r.dealId) ?? null;
    const space = deal ? spacesById.get(deal.spaceId) ?? null : null;
    return {
      id: r.id,
      dealId: r.dealId,
      status: r.status,
      reason: r.reason,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      resolvedNote: r.resolvedNote,
      requestingUser: {
        id: user?.id ?? r.requestingUserId,
        name: user?.name ?? null,
        email: user?.email ?? null,
      },
      deal: {
        id: deal?.id ?? r.dealId,
        title: deal?.title ?? null,
        value: deal?.value ?? null,
        spaceSlug: space?.slug ?? null,
      },
      commentCount: commentCountByReview.get(r.id) ?? 0,
    };
  });

  // Sort: open first, then approved, then closed. Within a group, keep the
  // createdAt DESC order from the query.
  const STATUS_RANK: Record<ReviewRow['status'], number> = { open: 0, approved: 1, closed: 2 };
  shaped.sort((a, b) => {
    const ra = STATUS_RANK[a.status as ReviewRow['status']] ?? 99;
    const rb = STATUS_RANK[b.status as ReviewRow['status']] ?? 99;
    if (ra !== rb) return ra - rb;
    // Keep createdAt DESC within status group.
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });

  return NextResponse.json(shaped);
}
