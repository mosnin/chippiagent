import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

/**
 * Returns system-generated timeline events for a contact:
 * - Tour bookings, confirmations, completions, cancellations
 * - Deal creation events
 * These are merged with manual activities on the client side.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;
  const { id: contactId } = await params;

  // Get space first, then query contact scoped to that space to prevent
  // cross-tenant information disclosure.
  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data: contact } = await supabase.from('Contact').select('spaceId').eq('id', contactId).eq('spaceId', space.id).maybeSingle();
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const events: Array<{
    id: string;
    kind: string;
    type: string;
    content: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }> = [];

  // Fetch tours for this contact
  const { data: tours } = await supabase
    .from('Tour')
    .select('id, startsAt, endsAt, status, propertyAddress, createdAt, updatedAt')
    .eq('contactId', contactId)
    .order('startsAt', { ascending: false })
    .limit(50);

  for (const t of tours ?? []) {
    const dateStr = new Date(t.startsAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = new Date(t.startsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    // Tour creation event
    events.push({
      id: `tour-${t.id}-created`,
      kind: 'tour',
      type: 'tour_scheduled',
      content: `Tour scheduled for ${dateStr} at ${timeStr}${t.propertyAddress ? ` — ${t.propertyAddress}` : ''}`,
      metadata: { tourId: t.id },
      createdAt: t.createdAt,
    });

    // Status events (if not still scheduled)
    if (t.status === 'confirmed') {
      events.push({
        id: `tour-${t.id}-confirmed`,
        kind: 'tour',
        type: 'tour_confirmed',
        content: `Tour confirmed for ${dateStr}`,
        metadata: { tourId: t.id },
        createdAt: t.updatedAt || t.createdAt,
      });
    } else if (t.status === 'completed') {
      events.push({
        id: `tour-${t.id}-completed`,
        kind: 'tour',
        type: 'tour_completed',
        content: `Tour completed${t.propertyAddress ? ` — ${t.propertyAddress}` : ''}`,
        metadata: { tourId: t.id },
        createdAt: t.updatedAt || t.createdAt,
      });
    } else if (t.status === 'cancelled') {
      events.push({
        id: `tour-${t.id}-cancelled`,
        kind: 'tour',
        type: 'tour_cancelled',
        content: 'Tour was cancelled',
        metadata: { tourId: t.id },
        createdAt: t.updatedAt || t.createdAt,
      });
    } else if (t.status === 'no_show') {
      events.push({
        id: `tour-${t.id}-noshow`,
        kind: 'tour',
        type: 'tour_no_show',
        content: 'Guest did not show up for the tour',
        metadata: { tourId: t.id },
        createdAt: t.updatedAt || t.createdAt,
      });
    }
  }

  // Fetch deals linked to this contact — scope to the user's space via the
  // joined Deal record to prevent cross-tenant data leakage.
  const { data: dealLinks } = await supabase
    .from('DealContact')
    .select('Deal(id, title, createdAt, address, spaceId)')
    .eq('contactId', contactId);

  for (const row of (dealLinks ?? []) as any[]) {
    // Only include deals belonging to the same space as the contact
    if (row.Deal && row.Deal.spaceId === space.id) {
      events.push({
        id: `deal-${row.Deal.id}-created`,
        kind: 'deal',
        type: 'deal_created',
        content: `Deal "${row.Deal.title}" created${row.Deal.address ? ` — ${row.Deal.address}` : ''}`,
        metadata: { dealId: row.Deal.id },
        createdAt: row.Deal.createdAt,
      });
    }
  }

  return NextResponse.json(events);
}
