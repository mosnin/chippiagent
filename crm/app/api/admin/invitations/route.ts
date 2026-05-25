import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { auth } from '@clerk/nextjs/server';

/** GET /api/admin/invitations — list all invitations across all brokerages */
export async function GET() {
  try {
    await requirePlatformAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const session = await auth();
  const { allowed } = await checkRateLimit(`admin:read:${session.userId}`, 60, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { data: invitations, error } = await supabase
    .from('Invitation')
    .select('id, email, roleToAssign, status, expiresAt, createdAt, brokerageId, Brokerage(name)')
    .order('createdAt', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[admin/invitations] query failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  return NextResponse.json({ invitations: invitations ?? [] });
}
