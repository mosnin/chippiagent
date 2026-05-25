import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { isValidListingStatus, isValidPropertyType } from '@/lib/properties';

/**
 * Shared input sanitiser. Accepts a loose body and returns an object safe to
 * insert/update. Unknown fields are ignored. Numeric fields are coerced and
 * validated; enum fields are validated against their canonical set.
 */
function sanitiseBody(body: Record<string, unknown>, mode: 'create' | 'update') {
  const out: Record<string, unknown> = {};
  const errors: string[] = [];

  function numberField(key: string, { min, max, integer }: { min?: number; max?: number; integer?: boolean } = {}) {
    if (!(key in body)) return;
    const raw = body[key];
    if (raw === null || raw === '') { out[key] = null; return; }
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
    if (!isFinite(n)) { errors.push(`Invalid ${key}`); return; }
    if (integer && !Number.isInteger(n)) { errors.push(`${key} must be a whole number`); return; }
    if (min != null && n < min) { errors.push(`${key} must be ≥ ${min}`); return; }
    if (max != null && n > max) { errors.push(`${key} must be ≤ ${max}`); return; }
    out[key] = n;
  }

  function stringField(key: string, maxLen: number) {
    if (!(key in body)) return;
    const raw = body[key];
    if (raw === null || raw === '') { out[key] = null; return; }
    out[key] = String(raw).trim().slice(0, maxLen);
  }

  // Required on create, optional on update.
  if ('address' in body || mode === 'create') {
    const addr = typeof body.address === 'string' ? body.address.trim().slice(0, 500) : '';
    if (!addr) errors.push('address is required');
    else out.address = addr;
  }

  stringField('unitNumber', 50);
  stringField('city', 120);
  stringField('stateRegion', 120);
  stringField('postalCode', 20);
  stringField('mlsNumber', 60);
  stringField('listingUrl', 1000);
  stringField('notes', 5000);

  numberField('beds', { min: 0, max: 200 });
  numberField('baths', { min: 0, max: 200 });
  numberField('squareFeet', { min: 0, max: 10_000_000, integer: true });
  numberField('lotSizeSqft', { min: 0, max: 100_000_000, integer: true });
  numberField('yearBuilt', { min: 1600, max: 2200, integer: true });
  numberField('listPrice', { min: 0, max: 10_000_000_000 });

  if ('propertyType' in body) {
    if (body.propertyType === null || body.propertyType === '') out.propertyType = null;
    else if (isValidPropertyType(body.propertyType)) out.propertyType = body.propertyType;
    else errors.push('Invalid propertyType');
  }

  if ('listingStatus' in body) {
    if (isValidListingStatus(body.listingStatus)) out.listingStatus = body.listingStatus;
    else errors.push('Invalid listingStatus');
  }

  if ('photos' in body) {
    if (!Array.isArray(body.photos)) errors.push('photos must be an array');
    else {
      const arr = (body.photos as unknown[])
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim())
        .filter((x) => x.length > 0 && x.length <= 1000)
        .slice(0, 20);
      out.photos = arr;
    }
  }

  return { out, errors };
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const search = (req.nextUrl.searchParams.get('search') ?? '').trim().slice(0, 200);

  let query = supabase
    .from('Property')
    .select('*')
    .eq('spaceId', space.id)
    .order('updatedAt', { ascending: false })
    .limit(500);

  if (search) {
    // Escape PostgREST wildcards + strip filter-breaking characters.
    const escaped = search.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    const sanitized = escaped.replace(/[,()]/g, '');
    const pattern = `%${sanitized}%`;
    query = query.or(`address.ilike.${pattern},mlsNumber.ilike.${pattern},city.ilike.${pattern}`);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('[properties/GET] query failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Failed to fetch properties' }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const slug = typeof body.slug === 'string' ? body.slug : null;
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const { out, errors } = sanitiseBody(body, 'create');
  if (errors.length) return NextResponse.json({ error: errors.join(', ') }, { status: 400 });

  const insert = {
    id: crypto.randomUUID(),
    spaceId: space.id,
    listingStatus: out.listingStatus ?? 'active',
    photos: out.photos ?? [],
    ...out,
  };

  const { data, error } = await supabase.from('Property').insert(insert).select().single();
  if (error) {
    // 23505 = unique_violation (e.g. duplicate MLS #).
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'A property with that MLS number already exists' }, { status: 409 });
    }
    logger.error('[properties/POST] insert failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Failed to create property' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export { sanitiseBody as _sanitisePropertyBody };
