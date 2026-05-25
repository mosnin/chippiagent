import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { notifyBroker } from '@/lib/broker-notify';
import { notificationForReviewRequested } from '@/lib/notification-voice';

type Params = { params: Promise<{ id: string }> };

type DealLookupRow = {
  id: string;
  title: string | null;
  spaceId: string;
  Space:
    | {
        id: string;
        slug: string;
        brokerageId: string | null;
      }
    | null;
};

/**
 * POST /api/deals/[id]/review-request
 *
 * Agent flags one of their deals for broker review. Creates a DealReviewRequest
 * in the open state. A partial unique index enforces at most one open review
 * per deal — we catch the 23505 violation and return 409.
 *
 * Auth: caller must own the deal's space (or manage its brokerage, which is
 * what requireSpaceOwner already permits). We first resolve the deal to its
 * Space slug, then delegate to requireSpaceOwner.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id: dealId } = await params;

  // Parse body up-front so 400 takes precedence predictably.
  let body: { reason?: unknown };
  try {
    body = (await req.json()) as { reason?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const reasonRaw = body?.reason;
  if (typeof reasonRaw !== 'string') {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 });
  }
  const reason = reasonRaw.trim();
  if (reason.length < 1 || reason.length > 2000) {
    return NextResponse.json(
      { error: 'reason must be 1..2000 characters' },
      { status: 400 },
    );
  }

  // Resolve the deal (and its Space) by id. We use the service-role client,
  // so we need an independent access check after the fetch. The access check
  // is then routed through requireSpaceOwner(slug) to mirror the spec.
  const { data: dealRow, error: dealErr } = await supabase
    .from('Deal')
    .select('id, title, spaceId, Space(id, slug, brokerageId)')
    .eq('id', dealId)
    .maybeSingle<DealLookupRow>();

  if (dealErr) {
    logger.error('[deals/review-request/POST] deal fetch failed', { dealId }, dealErr);
    return NextResponse.json({ error: 'Failed to load deal' }, { status: 500 });
  }
  if (!dealRow || !dealRow.Space) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }

  const slug = dealRow.Space.slug;
  const authResult = await requireSpaceOwner(slug);
  if (authResult instanceof NextResponse) {
    // requireSpaceOwner returns 404 for missing space, 403 for non-owner. Map
    // 404-on-space to 404-on-deal so we never leak that the deal exists when
    // the caller can't access it.
    if (authResult.status === 404) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }
    return authResult;
  }
  const { userId: clerkId, space } = authResult;

  if (!dealRow.Space.brokerageId) {
    return NextResponse.json(
      { error: 'Deal is in a non-brokerage workspace; no review possible.' },
      { status: 409 },
    );
  }

  // Resolve the requesting User row (DB id, not clerk id).
  // Include `name` in the select — notifyBroker wants it in the metadata so
  // the broker's notification renders "Alice flagged ..." without a second
  // lookup downstream.
  const { data: userRow, error: userErr } = await supabase
    .from('User')
    .select('id, name')
    .eq('clerkId', clerkId)
    .maybeSingle<{ id: string; name: string | null }>();
  if (userErr || !userRow) {
    logger.error('[deals/review-request/POST] user lookup failed', { clerkId }, userErr);
    return NextResponse.json({ error: 'User not found' }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const reviewId = crypto.randomUUID();

  const { data: inserted, error: insertErr } = await supabase
    .from('DealReviewRequest')
    .insert({
      id: reviewId,
      dealId,
      requestingUserId: userRow.id,
      brokerageId: dealRow.Space.brokerageId,
      status: 'open',
      reason,
      createdAt: nowIso,
    })
    .select('id, dealId, status, reason, createdAt')
    .single<{
      id: string;
      dealId: string;
      status: 'open' | 'approved' | 'closed';
      reason: string;
      createdAt: string;
    }>();

  if (insertErr) {
    // Duplicate-open case. Postgres unique constraint violation = 23505.
    const code = (insertErr as { code?: string } | null)?.code;
    if (code === '23505') {
      return NextResponse.json(
        { error: 'This deal already has an open review request.' },
        { status: 409 },
      );
    }
    logger.error(
      '[deals/review-request/POST] insert failed',
      { dealId, brokerageId: dealRow.Space.brokerageId },
      insertErr,
    );
    return NextResponse.json({ error: 'Failed to create review request' }, { status: 500 });
  }

  void audit({
    actorClerkId: clerkId,
    action: 'CREATE',
    resource: 'DealReviewRequest',
    resourceId: reviewId,
    spaceId: space.id,
    req,
    metadata: { dealId, brokerageId: dealRow.Space.brokerageId },
  });

  const reviewCopy = notificationForReviewRequested(
    userRow.name ?? 'An agent',
    dealRow.title ?? 'Untitled deal',
    reason,
  );
  void notifyBroker({
    brokerageId: dealRow.Space.brokerageId,
    type: 'review_requested',
    title: reviewCopy.title,
    body: reviewCopy.description,
    // Include the requesting agent's name so downstream renderers (the
    // in-app bell, any future email/Slack bridge) don't need a second
    // User lookup to render "Alice flagged ...".
    metadata: {
      dealId,
      reviewRequestId: reviewId,
      requestingUserId: userRow.id,
      requestingUserName: userRow.name ?? null,
    },
  });

  return NextResponse.json(
    {
      id: inserted?.id ?? reviewId,
      dealId: inserted?.dealId ?? dealId,
      status: inserted?.status ?? 'open',
      reason: inserted?.reason ?? reason,
      createdAt: inserted?.createdAt ?? nowIso,
    },
    { status: 201 },
  );
}
