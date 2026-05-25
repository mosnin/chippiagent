import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const status = req.nextUrl.searchParams.get('status') ?? 'pending';
  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10);
  const limit = Math.min(isNaN(limitParam) ? 50 : limitParam, 100);

  const { data, error } = await supabase
    .from('AgentDraft')
    .select(`
      id, contactId, dealId, channel, subject, content, reasoning,
      priority, status, confidence, expiresAt, createdAt, updatedAt,
      Contact:contactId ( id, name, email, phone )
    `)
    .eq('spaceId', space.id)
    .eq('status', status)
    .order('priority', { ascending: false })
    .order('createdAt', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return NextResponse.json(data ?? []);
}
