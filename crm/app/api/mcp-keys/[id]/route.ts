import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

type Params = { params: Promise<{ id: string }> };

// DELETE /api/mcp-keys/[id] — revoke an API key
export async function DELETE(_req: NextRequest, { params }: Params) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  const { id } = await params;

  // Ensure the key belongs to the user's space before deleting
  const { data: existing } = await supabase
    .from('McpApiKey')
    .select('id')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (!existing)
    return NextResponse.json({ error: 'API key not found' }, { status: 404 });

  const { error } = await supabase.from('McpApiKey').delete().eq('id', id);

  if (error)
    return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 });

  return NextResponse.json({ success: true });
}
