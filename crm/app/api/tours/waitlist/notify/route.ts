import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';

/**
 * POST — notify a waitlisted guest that a slot opened up.
 * Sets status to 'notified' and gives them a 30-minute hold window.
 * Can also be called automatically when a tour is cancelled.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, waitlistId } = body;

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!waitlistId) return NextResponse.json({ error: 'waitlistId required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const { data: entry } = await supabase
    .from('TourWaitlist')
    .select('*')
    .eq('id', waitlistId)
    .eq('spaceId', space.id)
    .eq('status', 'waiting')
    .maybeSingle();

  if (!entry) {
    return NextResponse.json({ error: 'Waitlist entry not found or already notified' }, { status: 404 });
  }

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min hold

  const { data: updated, error } = await supabase
    .from('TourWaitlist')
    .update({
      status: 'notified',
      notifiedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    })
    .eq('id', waitlistId)
    .select()
    .single();
  if (error) throw error;

  // Send notification email
  const { data: settings } = await supabase
    .from('SpaceSetting')
    .select('businessName')
    .eq('spaceId', space.id)
    .maybeSingle();

  const businessName = settings?.businessName || space.name;
  const bookingUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/book/${slug}`;

  // Use the tour-emails module for sending
  try {
    const { sendEmail } = await import('@/lib/tour-waitlist-email');
    await sendEmail(entry.guestEmail, `A spot opened up — ${businessName}`, `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #111;">Good news!</h2>
        <p>Hi ${entry.guestName},</p>
        <p>A tour slot just opened up for <strong>${new Date(entry.preferredDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</strong> with ${businessName}.</p>
        <p>We're holding this spot for you for <strong>30 minutes</strong>. Book now before it's gone:</p>
        <p style="margin: 20px 0;">
          <a href="${bookingUrl}" style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Book Your Tour
          </a>
        </p>
        <p style="color: #888; font-size: 12px;">This hold expires at ${expiresAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.</p>
        <p style="color: #888; font-size: 12px; margin-top: 24px;">— ${businessName}</p>
      </div>
    `);
  } catch (err) {
    console.error('[waitlist] Email failed:', err);
  }

  return NextResponse.json(updated);
}
