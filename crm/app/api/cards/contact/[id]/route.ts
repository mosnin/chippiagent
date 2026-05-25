import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser, getSpaceFromSlug } from '@/lib/space';

/**
 * GET /api/cards/contact/[id]?slug=<workspace-slug>
 *
 * Lightweight card payload for the inline expandable contact card in the
 * Chippi chat. Returns only what the card renders — no dead weight.
 *
 * Auth: Clerk session. Space resolved via slug query param (from URL) or
 * via the authenticated user's own space when slug is absent.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const slug = req.nextUrl.searchParams.get('slug');

  const space = slug
    ? await getSpaceFromSlug(slug)
    : await getSpaceForUser(userId);

  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: contact, error: contactError } = await supabase
    .from('Contact')
    .select(
      'id, name, email, phone, tags, leadType, leadScore, scoreLabel, budget, followUpAt, notes, updatedAt, createdAt',
    )
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (contactError) {
    console.error('[cards/contact/GET] query error:', contactError);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Fetch the last 3 activity records for this contact
  const { data: activityRows } = await supabase
    .from('ContactActivity')
    .select('id, type, content, createdAt')
    .eq('contactId', id)
    .eq('spaceId', space.id)
    .order('createdAt', { ascending: false })
    .limit(5);

  // notes in Contact is a single string; surface as a single note item when present
  const notes =
    contact.notes
      ? [{ id: 'inline', content: contact.notes as string, createdAt: contact.updatedAt ?? contact.createdAt }]
      : [];

  const recentActivity = (activityRows ?? []).map((a: { id: string; type: string; content: string | null; createdAt: string }) => ({
    type: a.type,
    summary: a.content ?? a.type,
    createdAt: a.createdAt,
  }));

  return NextResponse.json({
    data: {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      tags: contact.tags ?? [],
      leadType: contact.leadType ?? null,
      leadScore: contact.leadScore ?? null,
      scoreLabel: contact.scoreLabel ?? null,
      budget: contact.budget ?? null,
      followUpAt: contact.followUpAt ?? null,
      notes,
      recentActivity,
    },
  });
}
