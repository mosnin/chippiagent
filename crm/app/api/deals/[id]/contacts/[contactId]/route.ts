import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { isValidRole } from '@/lib/deals/roles';

/**
 * Update the role on a DealContact row without touching the contact list
 * as a whole. Kept separate from /api/deals/:id PATCH (which replaces the
 * full contact set) so role edits survive simultaneous list changes.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id, contactId } = await params;
  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Verify the deal belongs to the caller's space before mutating.
  const { data: deal } = await supabase
    .from('Deal')
    .select('id')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // role: string | null — null clears the role.
  let role: string | null;
  if (body.role === null) {
    role = null;
  } else if (isValidRole(body.role)) {
    role = body.role;
  } else {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('DealContact')
    .update({ role })
    .eq('dealId', id)
    .eq('contactId', contactId)
    .select()
    .single();

  if (error) {
    logger.error('[deals/contacts/role] update failed', { dealId: id, contactId }, error);
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
  }

  return NextResponse.json(data);
}
