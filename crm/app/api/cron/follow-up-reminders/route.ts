import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendFollowUpDigest } from '@/lib/email';
import { sendSMS, followUpReminderSMS } from '@/lib/sms';

// Vercel Cron can invoke the same job twice. Claim the space-day before
// any email/SMS so a retry cannot double-text the realtor.
const FOLLOWUP_CLAIM_TTL_S = 26 * 60 * 60;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/follow-up-reminders] CRON_SECRET env var is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  // Get contacts with follow-ups that are overdue or due today (within last 24h)
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const { data: contacts, error: contactError } = await supabase
    .from('Contact')
    .select('id, name, phone, followUpAt, spaceId')
    .lte('followUpAt', now.toISOString())
    .gte('followUpAt', yesterday.toISOString());
  if (contactError) {
    console.error('[cron/follow-up-reminders] DB query failed', contactError);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  if (!contacts?.length) return NextResponse.json({ sent: 0 });

  // Group by spaceId
  const bySpace: Record<string, typeof contacts> = {};
  for (const c of contacts) {
    bySpace[c.spaceId] = [...(bySpace[c.spaceId] ?? []), c];
  }

  let sent = 0;
  let skippedDuplicate = 0;
  for (const [spaceId, spaceContacts] of Object.entries(bySpace)) {
    const { data: space } = await supabase
      .from('Space')
      .select('name, slug, ownerId')
      .eq('id', spaceId)
      .single();
    if (!space) continue;

    const { data: setting } = await supabase
      .from('SpaceSetting')
      .select('notifications, smsNotifications, phoneNumber, notifyFollowUps')
      .eq('spaceId', spaceId)
      .maybeSingle();
    // Skip if follow-up notifications are disabled, or all channels are off
    if (setting?.notifyFollowUps === false) continue;
    if (setting?.notifications === false && setting?.smsNotifications !== true) continue;

    const { data: user } = await supabase
      .from('User')
      .select('email')
      .eq('id', space.ownerId)
      .maybeSingle();

    // Email and SMS are independent. A missing owner email must not skip SMS.
    const emailOn = setting?.notifications !== false && Boolean(user?.email);
    const smsOn = setting?.smsNotifications === true && Boolean(setting?.phoneNumber);
    if (!emailOn && !smsOn) continue;

    // Claim before send. A lost claim means this space-day already fired.
    if (!(await claimFollowUpSpace(spaceId, now))) {
      skippedDuplicate += 1;
      continue;
    }

    try {
      if (emailOn && user?.email) {
        await sendFollowUpDigest({
          toEmail: user.email,
          spaceName: space.name,
          spaceSlug: space.slug,
          contacts: spaceContacts.map((c) => ({
            name: c.name,
            phone: c.phone,
            followUpAt: c.followUpAt,
          })),
        });
      }

      if (smsOn && setting?.phoneNumber) {
        const smsPromises = spaceContacts.map((c) =>
          sendSMS(
            followUpReminderSMS({
              spaceName: space.name,
              contactName: c.name,
              phone: setting.phoneNumber,
            })
          ).catch((err) => console.error('[cron] SMS follow-up failed', err))
        );
        await Promise.allSettled(smsPromises);
      }

      sent++;
    } catch (err) {
      console.error('[cron/follow-up-reminders] Failed to send digest', { spaceId, error: err });
    }
  }

  return NextResponse.json({ sent, skippedDuplicate });
}

/**
 * SET NX the space-day so two overlapping cron invocations cannot both send.
 * Fail open when KV is missing — the 24h followUpAt window is the fallback.
 */
async function claimFollowUpSpace(spaceId: string, now: Date): Promise<boolean> {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) return true;
  const day = now.toISOString().slice(0, 10);
  const key = `cron:followup:${spaceId}:${day}`;
  try {
    const res = await fetch(
      `${kvUrl}/set/${encodeURIComponent(key)}/1/EX/${FOLLOWUP_CLAIM_TTL_S}/NX`,
      { method: 'POST', headers: { Authorization: `Bearer ${kvToken}` } },
    );
    if (!res.ok) return true;
    const { result } = (await res.json()) as { result: string | null };
    return result !== null;
  } catch {
    return true;
  }
}
