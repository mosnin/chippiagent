import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!q || q.length < 2) return NextResponse.json({ contacts: [], deals: [], tours: [] });

  try {
    const auth = await requireSpaceOwner(slug);
    if (auth instanceof NextResponse) return auth;
    const { space } = auth;

    // Escape PostgreSQL ILIKE special characters before wrapping in wildcards
    const escaped = q.slice(0, 100).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    // Strip characters that break PostgREST filter syntax (commas, parens, colons, dots as operators)
    const sanitized = escaped.replace(/[,()\.:;'"]/g, '');
    if (!sanitized.trim()) return NextResponse.json({ contacts: [], deals: [], tours: [] });
    const term = `%${sanitized}%`;

    // Run each query independently so one failure doesn't block the others
    const safeQuery = async <T>(label: string, promise: PromiseLike<T>): Promise<T | { data: null; error: unknown }> => {
      try { return await promise; } catch (err) { console.error(`[search] ${label} threw:`, err); return { data: null, error: err }; }
    };

    const contactsPromise = safeQuery('contacts', supabase
      .from('Contact')
      .select('id, name, email, phone, type, leadScore, scoreLabel')
      .eq('spaceId', space.id)
      .or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term}`)
      .limit(8));

    const dealsPromise = safeQuery('deals', supabase
      .from('Deal')
      .select('id, title, address, value, status, stageId')
      .eq('spaceId', space.id)
      .or(`title.ilike.${term},address.ilike.${term}`)
      .limit(8));

    const toursPromise = safeQuery('tours', supabase
      .from('Tour')
      .select('id, guestName, guestEmail, propertyAddress, startsAt, status')
      .eq('spaceId', space.id)
      .or(`guestName.ilike.${term},guestEmail.ilike.${term},propertyAddress.ilike.${term}`)
      .limit(8));

    const [contactsResult, dealsResult, toursResult] = await Promise.all([
      contactsPromise,
      dealsPromise,
      toursPromise,
    ]);

    if (contactsResult.error) console.error('[search] contacts error:', contactsResult.error);
    if (dealsResult.error) console.error('[search] deals error:', dealsResult.error);
    if (toursResult.error) console.error('[search] tours error:', toursResult.error);

    const contacts = (contactsResult.data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      email: c.email ?? null,
      phone: c.phone ?? null,
      type: c.type,
      leadScore: c.leadScore ?? null,
      scoreLabel: c.scoreLabel ?? null,
    }));

    // Fetch stage info separately to avoid PostgREST join + or() filter conflicts
    const dealRows = dealsResult.data ?? [];
    const stageIds = [...new Set(dealRows.map((d: any) => d.stageId).filter(Boolean))];
    let stageMap: Record<string, { name: string; color: string }> = {};
    if (stageIds.length > 0) {
      const { data: stages } = await supabase
        .from('DealStage')
        .select('id, name, color')
        .in('id', stageIds);
      for (const s of stages ?? []) {
        stageMap[s.id] = { name: s.name, color: s.color };
      }
    }

    const deals = dealRows.map((d: any) => ({
      id: d.id,
      title: d.title,
      address: d.address ?? null,
      value: d.value ?? null,
      status: d.status ?? 'active',
      stage: stageMap[d.stageId] ?? null,
    }));

    const tours = (toursResult.data ?? []).map((t: any) => ({
      id: t.id,
      guestName: t.guestName,
      guestEmail: t.guestEmail ?? null,
      propertyAddress: t.propertyAddress ?? null,
      startsAt: t.startsAt,
      status: t.status ?? 'scheduled',
    }));

    return NextResponse.json({ contacts, deals, tours });
  } catch (err) {
    console.error('[search] unexpected error:', err);
    return NextResponse.json({ contacts: [], deals: [], tours: [], error: 'Search failed' }, { status: 500 });
  }
}
