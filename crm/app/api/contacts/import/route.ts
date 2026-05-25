import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';

const VALID_TYPES = new Set(['QUALIFICATION', 'TOUR', 'APPLICATION']);

// 1 MB ceiling — 500 rows × generous per-row size is comfortably under this.
// Cuts off pathological JSON bodies before parsing into memory.
const MAX_BODY_BYTES = 1_048_576;

export async function POST(req: NextRequest) {
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
  }

  const body = await req.json();
  const { slug, rows } = body as {
    slug: string;
    rows: {
      name: string;
      phone?: string | null;
      email?: string | null;
      budget?: number | null;
      type?: string | null;
      notes?: string | null;
    }[];
  };

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!Array.isArray(rows) || rows.length === 0)
    return NextResponse.json({ error: 'rows required' }, { status: 400 });
  if (rows.length > 500)
    return NextResponse.json({ error: 'Maximum 500 rows per import' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { userId, space } = auth;

  // Rate limit: max 5 imports per user per hour
  const { allowed } = await checkRateLimit(`import:${userId}`, 5, 3600);
  if (!allowed) return NextResponse.json({ error: 'Import rate limit exceeded. Try again later.' }, { status: 429 });

  const now = new Date().toISOString();
  const inserts = rows
    .filter((r) => r.name?.trim())
    .map((r) => {
      const name = r.name.trim().slice(0, 200);
      return {
        id: crypto.randomUUID(),
        spaceId: space.id,
        name,
        phone: r.phone?.trim().slice(0, 20) || null,
        email: r.email?.trim().slice(0, 254) || null,
        budget: r.budget != null && !isNaN(parseFloat(String(r.budget))) && parseFloat(String(r.budget)) >= 0 ? parseFloat(String(r.budget)) : null,
        type: r.type && VALID_TYPES.has(r.type) ? r.type : 'QUALIFICATION',
        notes: r.notes?.trim().slice(0, 5000) || null,
        tags: [],
        properties: [],
        scoringStatus: 'unscored',
        createdAt: now,
        updatedAt: now,
      };
    });

  if (inserts.length === 0)
    return NextResponse.json({ error: 'No valid rows (name is required)' }, { status: 400 });

  const { error } = await supabase.from('Contact').insert(inserts);
  if (error) {
    console.error('[import] insert error:', error);
    return NextResponse.json({ error: 'Failed to import contacts' }, { status: 500 });
  }

  return NextResponse.json({ created: inserts.length });
}
