import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';

async function resolveDealSpace(dealId: string, userId: string) {
  const space = await getSpaceForUser(userId);
  if (!space) return null;
  const { data: dealRows, error } = await supabase
    .from('Deal')
    .select('spaceId')
    .eq('id', dealId)
    .eq('spaceId', space.id)
    .limit(1);
  if (error) throw error;
  if (!dealRows?.length) return null;
  return space;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const space = await resolveDealSpace(id, userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('DealActivity')
    .select('*')
    .eq('dealId', id)
    .order('createdAt', { ascending: false });
  if (error) throw error;

  return NextResponse.json(data ?? []);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;
  const space = await resolveDealSpace(id, userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { type, content, metadata } = body;

  // Only user-facing activity types are accepted here. `stage_change` and
  // `status_change` are server-internal and written from PATCH /api/deals/[id]
  // when the stage or status actually changes. Letting clients POST those
  // would let a malicious caller forge a fake stage-change history that
  // didn't reflect a real DB transition.
  const PUBLIC_TYPES = ['note', 'call', 'email', 'meeting', 'follow_up'];
  if (!type || !PUBLIC_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid activity type' }, { status: 400 });
  }

  // Cap metadata size — match the contact-activity equivalent. Without this,
  // a 10 MB metadata object lands in the DB unchecked.
  if (metadata !== undefined && metadata !== null) {
    try {
      if (JSON.stringify(metadata).length > 10000) {
        return NextResponse.json({ error: 'metadata too large (max 10KB)' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'metadata must be JSON-serializable' }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from('DealActivity')
    .insert({
      id: crypto.randomUUID(),
      dealId: id,
      spaceId: space.id,
      type,
      content: typeof content === 'string' ? content.replace(/<[^>]*>/g, '').slice(0, 5000) : null,
      metadata: metadata ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  return NextResponse.json(data, { status: 201 });
}
