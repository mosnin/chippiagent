/**
 * GET  /api/studio/brand — the space's brand kit (or empty defaults).
 * PUT  /api/studio/brand — upsert the brand kit.
 *
 * The kit (palette, voice, social handles) is what keeps Studio output
 * on-brand. One StudioBrand row per space.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

interface BrandHandles {
  instagram?: string;
  facebook?: string;
  linkedin?: string;
}

const EMPTY = { colors: [] as string[], voice: '', handles: {} as BrandHandles };

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('StudioBrand')
    .select('colors, voice, handles')
    .eq('spaceId', space.id)
    .maybeSingle();
  if (error) {
    logger.error('[studio.brand] read failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Could not load your brand kit.' }, { status: 500 });
  }
  if (!data) return NextResponse.json(EMPTY);

  return NextResponse.json({
    colors: (data.colors as string[] | null) ?? [],
    voice: (data.voice as string | null) ?? '',
    handles: (data.handles as BrandHandles | null) ?? {},
  });
}

export async function PUT(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { colors?: unknown; voice?: unknown; handles?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Sanitize: 6-digit hex colors only, a bounded voice, trimmed handles.
  const colors = Array.isArray(body.colors)
    ? body.colors
        .filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))
        .slice(0, 8)
    : [];
  const voice = typeof body.voice === 'string' ? body.voice.trim().slice(0, 1000) : '';
  const h = (body.handles ?? {}) as Record<string, unknown>;
  const clean = (v: unknown) =>
    typeof v === 'string' ? v.trim().replace(/^@/, '').slice(0, 100) : '';
  const handles: BrandHandles = {
    instagram: clean(h.instagram),
    facebook: clean(h.facebook),
    linkedin: clean(h.linkedin),
  };

  const { error } = await supabase.from('StudioBrand').upsert(
    {
      spaceId: space.id,
      colors,
      voice,
      handles,
      updatedAt: new Date().toISOString(),
    },
    { onConflict: 'spaceId' },
  );
  if (error) {
    logger.error('[studio.brand] save failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Could not save your brand kit.' }, { status: 500 });
  }

  return NextResponse.json({ colors, voice, handles });
}
