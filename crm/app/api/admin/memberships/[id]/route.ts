import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requirePlatformAdmin } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { logAdminAction } from '@/lib/admin';

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/admin/memberships/[id]
 * Remove a brokerage membership and unlink the user's space from the brokerage.
 */
export async function DELETE(_req: Request, { params }: Params) {
  let admin: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    admin = await requirePlatformAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await auth();
  const { allowed } = await checkRateLimit(`admin:${session.userId}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id } = await params;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  // Fetch membership first so we can unlink the space
  const { data: membership } = await supabase
    .from('BrokerageMembership')
    .select('userId, brokerageId')
    .eq('id', id)
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: 'Membership not found' }, { status: 404 });

  // Unlink space from brokerage (best-effort)
  const { data: space } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', membership.userId)
    .maybeSingle();
  if (space) {
    await supabase.from('Space').update({ brokerageId: null }).eq('id', space.id);
  }

  const { error } = await supabase.from('BrokerageMembership').delete().eq('id', id);
  if (error) {
    console.error('[admin/memberships] delete failed', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }

  await logAdminAction({ actor: admin.clerkUserId, action: 'delete_membership', target: id, details: {} });

  return NextResponse.json({ message: 'Membership removed' });
}
