import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { syncContact } from '@/lib/vectorize';
import { notifyNewContact } from '@/lib/notify';
import { fireAgentTrigger } from '@/lib/agent/fire-trigger';
import type { Contact } from '@/lib/types';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const search = req.nextUrl.searchParams.get('search') ?? '';
  const type = req.nextUrl.searchParams.get('type');
  // Snooze hygiene: by default hide currently-snoozed contacts from the main
  // People view. Callers that need them (e.g. a "Snoozed" tab, or the
  // command palette fuzzy search) can pass ?includeSnoozed=1.
  const includeSnoozed = req.nextUrl.searchParams.get('includeSnoozed') === '1';
  const onlySnoozed = req.nextUrl.searchParams.get('onlySnoozed') === '1';

  let query = supabase
    .from('Contact')
    .select('*')
    .eq('spaceId', space.id)
    .is('brokerageId', null); // Exclude brokerage leads — those show on /broker/leads

  if (!includeSnoozed && !onlySnoozed) {
    query = query.or(`snoozedUntil.is.null,snoozedUntil.lte.${new Date().toISOString()}`);
  } else if (onlySnoozed) {
    query = query.gt('snoozedUntil', new Date().toISOString());
  }

  if (search) {
    // Cap length to prevent expensive full-table-scan patterns
    const limitedSearch = search.slice(0, 100).trim().toLowerCase();
    // Forgiving multi-token search:
    //   - split on whitespace into tokens
    //   - each non-empty token must match (AND across tokens, via chained .or())
    //   - each token can match ANY of name/email/phone/preferences (OR within token)
    // Example: "jane hot" matches a contact named "Jane" tagged "hot".
    const tokens = limitedSearch
      .split(/\s+/)
      .filter((t) => t.length > 0)
      // Cap the number of tokens to avoid pathological queries
      .slice(0, 8);

    for (const token of tokens) {
      // Escape PostgreSQL ILIKE special characters before wrapping in wildcards
      const escaped = token.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
      // Strip PostgREST filter-breaking characters (commas, parens)
      const sanitized = escaped.replace(/[,()]/g, '');
      if (!sanitized) continue;
      const pattern = `%${sanitized}%`;
      // Chained .or() calls are AND-combined by PostgREST, giving us
      // "(field OR field OR ...) AND (field OR field OR ...)" across tokens.
      query = query.or(
        `name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},preferences.ilike.${pattern}`
      );
    }
  }

  if (type && type !== 'ALL') {
    query = query.eq('type', type);
  }

  // Pagination: default 500, max 1000
  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '500', 10);
  const offsetParam = parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10);
  const limit = Math.min(Math.max(1, limitParam || 500), 1000);
  const offset = Math.max(0, offsetParam || 0);

  const { data: contacts, error } = await query
    .order('createdAt', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    console.error('[contacts/GET] query error:', error);
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
  }

  return NextResponse.json(contacts as Contact[]);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, name, email, phone, budget, preferences, properties, address, notes, type, tags } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (name.length > 200) {
    return NextResponse.json({ error: 'name must be 200 characters or fewer' }, { status: 400 });
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const id = crypto.randomUUID();
  const budgetVal = budget != null && budget !== '' ? parseFloat(budget) : null;
  if (budgetVal !== null && (Number.isNaN(budgetVal) || budgetVal < 0)) {
    return NextResponse.json({ error: 'Invalid budget' }, { status: 400 });
  }

  // Match PATCH's structural bounds — name was the only field validated here,
  // so everything else could land in the DB at any size.
  const emailVal = email ? String(email).trim().slice(0, 254) : null;
  const phoneVal = phone ? String(phone).trim().slice(0, 20) : null;
  const addressVal = address ? String(address).trim().slice(0, 500) : null;
  const notesVal = notes ? String(notes).trim().slice(0, 5000) : null;
  const preferencesVal = preferences ? String(preferences).trim().slice(0, 5000) : null;

  const propsVal = Array.isArray(properties)
    ? properties
        .filter((p: unknown): p is string => typeof p === 'string')
        .slice(0, 50)
        .map((p) => p.slice(0, 500))
    : [];
  const tagsVal = Array.isArray(tags)
    ? tags
        .filter((t: unknown): t is string => typeof t === 'string')
        .slice(0, 50)
        .map((t) => t.slice(0, 100))
    : [];

  const VALID_TYPES = ['QUALIFICATION', 'TOUR', 'APPLICATION'] as const;
  const contactType = VALID_TYPES.includes(type) ? type : 'QUALIFICATION';

  const { data: contact, error } = await supabase.from('Contact').insert({
    id,
    spaceId: space.id,
    name: name.trim().slice(0, 200),
    email: emailVal,
    phone: phoneVal,
    address: addressVal,
    notes: notesVal,
    type: contactType,
    budget: budgetVal,
    preferences: preferencesVal,
    properties: propsVal,
    tags: tagsVal,
  }).select().single();
  if (error) {
    console.error('[contacts/POST] insert error:', error);
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
  }

  // Async vectorization — don't block the response
  syncContact(contact as Contact).catch(console.error);

  // SMS notification for new leads
  try {
    await notifyNewContact({
      spaceId: space.id,
      contactName: name,
      contactPhone: phoneVal,
      contactEmail: emailVal,
      tags: tagsVal,
    });
  } catch (e) { console.error('[contacts] notification failed:', e); }

  // Fire the agent trigger so Chippi can act on the new lead in real time
  // instead of waiting for the 4-hour cron sweep. Never lets a trigger
  // failure fail the response — the contact write is what was requested.
  try {
    await fireAgentTrigger({ spaceId: space.id, event: 'new_lead', contactId: contact.id });
  } catch (e) { console.error('[contacts] agent trigger failed:', e); }

  return NextResponse.json(contact, { status: 201 });
}
