import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

/**
 * Shift every unchecked, dated checklist item on a deal by N days.
 *
 * Used when the realtor moves the expected close date and wants the whole
 * schedule (inspection deadline, appraisal, loan commitment, etc.) to ride
 * along. Completed items aren't touched — the history stays honest. Items
 * without a dueAt are left alone too, since there's nothing to shift.
 *
 * Server-side shift rather than client-side multi-PATCH so we do it in one
 * round-trip and the update is atomic from the client's point of view.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: deal } = await supabase
    .from('Deal')
    .select('id')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { days?: unknown } | null;
  if (!body || typeof body.days !== 'number' || !Number.isFinite(body.days)) {
    return NextResponse.json({ error: 'days must be a number' }, { status: 400 });
  }
  // Clamp to a defensive range — realistic shifts are at most a few months.
  // This prevents runaway "shift by 10k days" edits from a broken client.
  const days = Math.trunc(body.days);
  if (Math.abs(days) > 365) {
    return NextResponse.json({ error: 'days out of range (±365 max)' }, { status: 400 });
  }
  if (days === 0) return NextResponse.json({ updated: 0 });

  const { data: items, error: fetchError } = await supabase
    .from('DealChecklistItem')
    .select('id, dueAt, completedAt')
    .eq('dealId', id)
    .eq('spaceId', space.id)
    .is('completedAt', null)
    .not('dueAt', 'is', null);

  if (fetchError) {
    logger.error('[checklist/shift] fetch failed', { dealId: id }, fetchError);
    return NextResponse.json({ error: 'Failed to load checklist' }, { status: 500 });
  }

  const ms = days * 86_400_000;
  let updated = 0;
  const failures: string[] = [];
  for (const row of items ?? []) {
    const existing = new Date(row.dueAt as string);
    if (isNaN(existing.getTime())) continue;
    const next = new Date(existing.getTime() + ms);
    const { error: upErr } = await supabase
      .from('DealChecklistItem')
      .update({ dueAt: next.toISOString(), updatedAt: new Date().toISOString() })
      .eq('id', row.id as string)
      .eq('spaceId', space.id);
    if (upErr) failures.push(row.id as string);
    else updated += 1;
  }

  if (failures.length) {
    logger.warn('[checklist/shift] partial failure', { dealId: id, failed: failures.length, updated });
  }

  return NextResponse.json({ updated, failed: failures.length });
}
