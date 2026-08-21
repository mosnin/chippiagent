/**
 * Active-tour slot conflicts.
 *
 * Create paths go through `book_tour_atomic` (row lock + overlap reject).
 * PATCH /api/tours/[id] used to write startsAt/endsAt (or reactivate a
 * cancelled tour) with no check, so two scheduled tours could occupy the
 * same window. Same overlap rule as the RPC: scheduled/confirmed only,
 * startsAt < other.endsAt AND endsAt > other.startsAt.
 */

import { supabase } from '@/lib/supabase';

export const ACTIVE_TOUR_STATUSES = ['scheduled', 'confirmed'] as const;

export function isActiveTourStatus(status: string | null | undefined): boolean {
  return status === 'scheduled' || status === 'confirmed';
}

export function tourRangesOverlap(
  startA: string | Date,
  endA: string | Date,
  startB: string | Date,
  endB: string | Date,
): boolean {
  return new Date(startA).getTime() < new Date(endB).getTime()
    && new Date(endA).getTime() > new Date(startB).getTime();
}

export async function findActiveTourConflict(opts: {
  spaceId: string;
  startsAt: string;
  endsAt: string;
  excludeTourId?: string;
}): Promise<string | null> {
  let query = supabase
    .from('Tour')
    .select('id')
    .eq('spaceId', opts.spaceId)
    .in('status', ACTIVE_TOUR_STATUSES)
    .lt('startsAt', opts.endsAt)
    .gt('endsAt', opts.startsAt)
    .limit(5);
  if (opts.excludeTourId) {
    query = query.neq('id', opts.excludeTourId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data?.[0]?.id ?? null;
}
