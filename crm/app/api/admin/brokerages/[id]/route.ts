import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requirePlatformAdmin } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { logAdminAction } from '@/lib/admin';

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/admin/brokerages/[id]
 * Removes all memberships, unlinks spaces, then deletes the brokerage.
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

  // Unlink all member spaces from the brokerage first
  const { error: spaceError } = await supabase
    .from('Space')
    .update({ brokerageId: null })
    .eq('brokerageId', id);
  if (spaceError) {
    console.error('[admin/brokerages] space unlink failed', spaceError);
    return NextResponse.json({ error: 'Failed to unlink spaces' }, { status: 500 });
  }

  // Delete all memberships
  const { error: membershipError } = await supabase.from('BrokerageMembership').delete().eq('brokerageId', id);
  if (membershipError) {
    console.error('[admin/brokerages] membership delete failed', membershipError);
    return NextResponse.json({ error: 'Failed to delete memberships' }, { status: 500 });
  }

  // Delete invitations
  const { error: invitationError } = await supabase.from('Invitation').delete().eq('brokerageId', id);
  if (invitationError) {
    console.error('[admin/brokerages] invitation delete failed', invitationError);
    return NextResponse.json({ error: 'Failed to delete invitations' }, { status: 500 });
  }

  // Delete the brokerage
  const { error } = await supabase.from('Brokerage').delete().eq('id', id);
  if (error) {
    console.error('[admin/brokerages] delete failed', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }

  await logAdminAction({ actor: admin.clerkUserId, action: 'delete_brokerage', target: id, details: {} });

  return NextResponse.json({ message: 'Brokerage deleted' });
}

/** PATCH /api/admin/brokerages/[id] — suspend or reactivate a brokerage */
export async function PATCH(req: Request, { params }: Params) {
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

  let status: string;
  try {
    ({ status } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!['active', 'suspended'].includes(status)) {
    return NextResponse.json({ error: 'status must be active or suspended' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('Brokerage')
    .update({ status })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Brokerage not found' }, { status: 404 });
  }

  await logAdminAction({ actor: admin.clerkUserId, action: 'update_brokerage_status', target: id, details: { status } });

  return NextResponse.json({ brokerage: data });
}
