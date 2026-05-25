import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/platform/announcements
 * Returns active announcements targeted at the current user, excluding ones
 * they have already dismissed. Segment matching:
 *   - 'all'       → everyone
 *   - 'trial'     → Space.stripeSubscriptionStatus = 'trialing'
 *   - 'active'    → Space.stripeSubscriptionStatus = 'active'
 *   - 'past_due'  → Space.stripeSubscriptionStatus = 'past_due'
 *   - 'admin'     → User.platformRole = 'admin'
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Look up the current user and their primary space (for subscription status).
  const { data: user } = await supabase
    .from('User')
    .select('id, platformRole, Space(stripeSubscriptionStatus)')
    .eq('clerkId', userId)
    .maybeSingle();

  const space = user
    ? Array.isArray((user as any).Space)
      ? (user as any).Space[0]
      : (user as any).Space
    : null;
  const subStatus: string | null = space?.stripeSubscriptionStatus ?? null;
  const isAdmin = user?.platformRole === 'admin';

  // Determine which segments apply to this user.
  const segments: string[] = ['all'];
  if (subStatus === 'trialing') segments.push('trial');
  if (subStatus === 'active') segments.push('active');
  if (subStatus === 'past_due') segments.push('past_due');
  if (isAdmin) segments.push('admin');

  const now = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from('Announcement')
    .select('*')
    .eq('active', true)
    .in('targetSegment', segments)
    .or(`startsAt.is.null,startsAt.lte.${now}`)
    .or(`endsAt.is.null,endsAt.gte.${now}`)
    .order('createdAt', { ascending: false });

  if (error) {
    console.error('[platform/announcements] query failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const all = rows ?? [];
  if (all.length === 0) return NextResponse.json({ announcements: [] });

  // Filter out ones this user has dismissed.
  const ids = all.map((a) => a.id);
  const { data: dismissals } = await supabase
    .from('AnnouncementDismissal')
    .select('announcementId')
    .eq('userId', userId)
    .in('announcementId', ids);

  const dismissed = new Set((dismissals ?? []).map((d) => d.announcementId));
  const filtered = all.filter((a) => !dismissed.has(a.id));

  return NextResponse.json({ announcements: filtered });
}
