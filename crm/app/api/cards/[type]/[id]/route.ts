import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

// ── GET /api/cards/[type]/[id]?spaceId=... ───────────────────────────────────
// Returns rich data for expandable chat cards. Auth required — user must own
// the space. spaceId is validated against the authenticated user's space.

const ALLOWED_TYPES = ['contact', 'deal', 'tour', 'property'] as const;
type CardType = (typeof ALLOWED_TYPES)[number];

function isCardType(v: string): v is CardType {
  return (ALLOWED_TYPES as readonly string[]).includes(v);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { type, id } = await params;

  // Validate type early — no auth round-trip needed for a bad type.
  if (!isCardType(type)) {
    return NextResponse.json(
      { error: `Unknown card type "${type}". Must be one of: ${ALLOWED_TYPES.join(', ')}` },
      { status: 400 },
    );
  }

  const spaceId = req.nextUrl.searchParams.get('spaceId');
  if (!spaceId) {
    return NextResponse.json({ error: 'spaceId query param required' }, { status: 400 });
  }

  // Auth
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // Verify caller owns the space.
  const space = await getSpaceForUser(userId);
  if (!space || space.id !== spaceId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    switch (type) {
      case 'contact':
        return handleContact(id, space.id);
      case 'deal':
        return handleDeal(id, space.id);
      case 'tour':
        return handleTour(id, space.id);
      case 'property':
        return handleProperty(id, space.id);
    }
  } catch (err) {
    console.error(`[cards/${type}/GET] unexpected error:`, err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── Contact ──────────────────────────────────────────────────────────────────

async function handleContact(id: string, spaceId: string): Promise<NextResponse> {
  const { data: row, error } = await supabase
    .from('Contact')
    .select(
      'id, name, email, phone, tags, leadType, leadScore, scoreLabel, budget, followUpAt, lastContactedAt',
    )
    .eq('id', id)
    .eq('spaceId', spaceId)
    .maybeSingle();

  if (error) {
    console.error('[cards/contact/GET] query error:', error);
    return NextResponse.json({ error: 'Failed to fetch contact' }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Fetch last 3 ContactActivity entries as recentActivity.
  const { data: activities, error: actError } = await supabase
    .from('ContactActivity')
    .select('id, type, content, createdAt')
    .eq('contactId', id)
    .eq('spaceId', spaceId)
    .order('createdAt', { ascending: false })
    .limit(3);

  if (actError) {
    console.error('[cards/contact/GET] activity query error:', actError);
  }

  const recentActivity = (activities ?? []).map((a: { type: string; content: string | null; createdAt: string }) => ({
    type: a.type,
    summary: a.content ?? '',
    createdAt: a.createdAt,
  }));

  // Map the last 3 activities also as "notes" (using note-type activities as
  // the closest analogue — the Contact row has a single freeform notes string,
  // not a notes table).
  const noteActivities = (activities ?? []).filter((a: { type: string }) => a.type === 'note').slice(0, 3);
  const notes = noteActivities.map((a: { id: string; content: string | null; createdAt: string }) => ({
    id: a.id,
    content: a.content ?? '',
    createdAt: a.createdAt,
  }));

  const scoreLabel = (row.scoreLabel as string | null);
  const normalizedScoreLabel: 'hot' | 'warm' | 'cold' | null =
    scoreLabel === 'hot' || scoreLabel === 'warm' || scoreLabel === 'cold'
      ? scoreLabel
      : null;

  return NextResponse.json({
    data: {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      tags: row.tags ?? [],
      leadType: (row.leadType as 'rental' | 'buyer' | null) ?? null,
      leadScore: row.leadScore ?? null,
      scoreLabel: normalizedScoreLabel,
      budget: row.budget ?? null,
      followUpAt: row.followUpAt ?? null,
      notes,
      lastActivityAt: (activities ?? []).length > 0 ? (activities![0] as { createdAt: string }).createdAt : (row.lastContactedAt ?? null),
      recentActivity,
    },
  });
}

// ── Deal ─────────────────────────────────────────────────────────────────────

async function handleDeal(id: string, spaceId: string): Promise<NextResponse> {
  const { data: row, error } = await supabase
    .from('Deal')
    .select(
      'id, title, stageId, value, commissionRate, propertyId, nextAction, closeDate, priority',
    )
    .eq('id', id)
    .eq('spaceId', spaceId)
    .maybeSingle();

  if (error) {
    console.error('[cards/deal/GET] query error:', error);
    return NextResponse.json({ error: 'Failed to fetch deal' }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Fetch stage name, linked property, contacts, and recent activities in
  // parallel to keep latency low.
  const [stageResult, propertyResult, contactsResult, activityResult] = await Promise.all([
    row.stageId
      ? supabase
          .from('DealStage')
          .select('id, name')
          .eq('id', row.stageId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    row.propertyId
      ? supabase
          .from('Property')
          .select('id, address')
          .eq('id', row.propertyId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    supabase
      .from('DealContact')
      .select('contactId, Contact(id, name)')
      .eq('dealId', id),

    supabase
      .from('DealActivity')
      .select('id, type, content, createdAt')
      .eq('dealId', id)
      .eq('spaceId', spaceId)
      .order('createdAt', { ascending: false })
      .limit(3),
  ]);

  const stage = stageResult.data ? (stageResult.data as { id: string; name: string }).name : 'Unknown';

  const property = propertyResult.data
    ? { id: (propertyResult.data as { id: string; address: string }).id, address: (propertyResult.data as { id: string; address: string }).address }
    : null;

  // Supabase returns the embedded relation as an array or object depending on
  // the join cardinality — use a loose Record type to avoid fighting generated types.
  const contacts = (contactsResult.data ?? [])
    .map((dc: Record<string, unknown>) => {
      const raw = dc.Contact;
      const c = Array.isArray(raw) ? (raw[0] as Record<string, unknown> | undefined) : (raw as Record<string, unknown> | null);
      return c ? { id: c.id as string, name: c.name as string } : null;
    })
    .filter((c): c is { id: string; name: string } => c !== null);

  const notes = (activityResult.data ?? [])
    .filter((a: { type: string }) => a.type === 'note')
    .slice(0, 3)
    .map((a: { id: string; content: string | null; createdAt: string }) => ({
      id: a.id,
      content: a.content ?? '',
      createdAt: a.createdAt,
    }));

  // commissionEstimate = value * commissionRate / 100
  const commissionEstimate =
    row.value != null && row.commissionRate != null
      ? Math.round(row.value * (row.commissionRate / 100) * 100) / 100
      : null;

  return NextResponse.json({
    data: {
      id: row.id,
      title: row.title,
      stage,
      amount: row.value ?? null,
      commissionEstimate,
      property,
      contacts,
      notes,
      nextStep: row.nextAction ?? null,
      closeDate: row.closeDate ?? null,
      priority: row.priority ?? null,
    },
  });
}

// ── Tour ─────────────────────────────────────────────────────────────────────

async function handleTour(id: string, spaceId: string): Promise<NextResponse> {
  const { data: row, error } = await supabase
    .from('Tour')
    .select(
      'id, startsAt, endsAt, status, notes, contactId, propertyAddress, guestName, guestEmail, guestPhone',
    )
    .eq('id', id)
    .eq('spaceId', spaceId)
    .maybeSingle();

  if (error) {
    console.error('[cards/tour/GET] query error:', error);
    return NextResponse.json({ error: 'Failed to fetch tour' }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Join Contact by contactId if present.
  let contact: { id: string; name: string; phone: string | null; email: string | null } | null = null;
  if (row.contactId) {
    const { data: contactRow } = await supabase
      .from('Contact')
      .select('id, name, phone, email')
      .eq('id', row.contactId)
      .eq('spaceId', spaceId)
      .maybeSingle();
    if (contactRow) {
      contact = {
        id: contactRow.id,
        name: contactRow.name,
        phone: contactRow.phone ?? null,
        email: contactRow.email ?? null,
      };
    }
  }

  // Tour doesn't have a linked Property row; it stores propertyAddress as a
  // string. Build a minimal property shape if the address is present.
  const property: { id: string; address: string; price: number | null } | null =
    row.propertyAddress
      ? { id: '', address: row.propertyAddress, price: null }
      : null;

  // Duration in minutes
  let duration: number | null = null;
  if (row.startsAt && row.endsAt) {
    const start = new Date(row.startsAt).getTime();
    const end = new Date(row.endsAt).getTime();
    if (!isNaN(start) && !isNaN(end) && end > start) {
      duration = Math.round((end - start) / 60_000);
    }
  }

  return NextResponse.json({
    data: {
      tourId: row.id,
      scheduledAt: row.startsAt,
      endsAt: row.endsAt ?? null,
      status: row.status,
      property,
      contact,
      notes: row.notes ?? null,
      duration,
    },
  });
}

// ── Property ─────────────────────────────────────────────────────────────────

async function handleProperty(id: string, spaceId: string): Promise<NextResponse> {
  const { data: row, error } = await supabase
    .from('Property')
    .select(
      'id, address, listPrice, beds, baths, squareFeet, listingStatus, notes, photos, createdAt',
    )
    .eq('id', id)
    .eq('spaceId', spaceId)
    .maybeSingle();

  if (error) {
    console.error('[cards/property/GET] query error:', error);
    return NextResponse.json({ error: 'Failed to fetch property' }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Count linked deals.
  const { count: dealCount, error: dcError } = await supabase
    .from('Deal')
    .select('id', { count: 'exact', head: true })
    .eq('propertyId', id)
    .eq('spaceId', spaceId);

  if (dcError) {
    console.error('[cards/property/GET] deal count error:', dcError);
  }

  return NextResponse.json({
    data: {
      id: row.id,
      address: row.address,
      price: row.listPrice ?? null,
      beds: row.beds ?? null,
      baths: row.baths ?? null,
      sqft: row.squareFeet ?? null,
      listingStatus: row.listingStatus,
      daysOnMarket: null, // not stored in the Property table
      dealCount: dealCount ?? 0,
      description: row.notes ?? null,
      photos: Array.isArray(row.photos) ? (row.photos as string[]) : [],
    },
  });
}
