import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';

// GET /api/notes?slug=xxx — list all notes for a workspace
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const { data, error } = await supabase
    .from('Note')
    .select('id, title, icon, sortOrder, updatedAt')
    .eq('spaceId', space.id)
    .order('sortOrder', { ascending: true });

  if (error) return NextResponse.json({ error: 'Failed to load notes' }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/notes — create a new note
export async function POST(req: NextRequest) {
  const { slug, title } = await req.json();
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Rate limit: 60 notes per hour per user
  const { allowed } = await checkRateLimit(`notes:${space.id}`, 60, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many notes created. Try again later.' }, { status: 429 });
  }

  // Get max sortOrder
  const { data: maxRow } = await supabase
    .from('Note')
    .select('sortOrder')
    .eq('spaceId', space.id)
    .order('sortOrder', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = (maxRow?.sortOrder ?? 0) + 1;

  const { data, error } = await supabase
    .from('Note')
    .insert({ spaceId: space.id, title: (title || 'Untitled').slice(0, 200), content: '', sortOrder })
    .select()
    .single();

  if (error) return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
