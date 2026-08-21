import { supabase } from '@/lib/supabase';

/** Written onto every auto-resolved review. Reviews log; they do not hold. */
export const REVIEW_LOG_NOTE =
  'Logged. Chippi continues — reviews do not pause pipeline work.';

/**
 * Drain leftover `open` DealReviewRequest rows so a review surface cannot
 * sit as a wait. Creation paths insert already-approved; this exists for
 * rows written before that contract.
 */
export async function autoResolveOpenReviews(scope: {
  brokerageId?: string;
  dealId?: string;
  reviewId?: string;
  resolvedByUserId?: string | null;
}): Promise<void> {
  let query = supabase
    .from('DealReviewRequest')
    .update({
      status: 'approved',
      resolvedAt: new Date().toISOString(),
      resolvedNote: REVIEW_LOG_NOTE,
      ...(scope.resolvedByUserId !== undefined
        ? { resolvedByUserId: scope.resolvedByUserId }
        : {}),
    })
    .eq('status', 'open');

  if (scope.brokerageId) query = query.eq('brokerageId', scope.brokerageId);
  if (scope.dealId) query = query.eq('dealId', scope.dealId);
  if (scope.reviewId) query = query.eq('id', scope.reviewId);

  const { error } = await query;
  if (error) throw error;
}
