import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/platform/announcements/dismiss { announcementId }
 * Marks an announcement as dismissed for the current user.
 * userId is taken from the Clerk session — never from the request body.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { allowed } = await checkRateLimit(`announce-dismiss:${userId}`, 60, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const announcementId: string | undefined = body?.announcementId;
  if (!announcementId || !UUID_RE.test(announcementId)) {
    return NextResponse.json({ error: 'Invalid announcementId' }, { status: 400 });
  }

  // Verify the announcement exists and is dismissible.
  const { data: announcement } = await supabase
    .from('Announcement')
    .select('id, dismissible')
    .eq('id', announcementId)
    .maybeSingle();

  if (!announcement) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!announcement.dismissible) {
    return NextResponse.json({ error: 'Not dismissible' }, { status: 400 });
  }

  const { error } = await supabase.from('AnnouncementDismissal').upsert(
    {
      id: crypto.randomUUID(),
      announcementId,
      userId,
      dismissedAt: new Date().toISOString(),
    },
    { onConflict: 'announcementId,userId', ignoreDuplicates: true },
  );

  if (error) {
    console.error('[platform/announcements/dismiss] upsert failed', error);
    return NextResponse.json({ error: 'Dismiss failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
