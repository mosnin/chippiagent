import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';

const notifySchema = z.object({
  brokerageId: z.string().min(1),
  taggedUserId: z.string().min(1),
  message: z.string().min(1).max(5000),
  senderName: z.string().min(1).max(200),
});

/**
 * POST /api/broker/chat-notify
 *
 * Sends an email notification to a tagged user when they are @mentioned
 * in the broker team chat.
 */
export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Rate limit: 20 notifications per hour per user
  const { allowed } = await checkRateLimit(`chat-notify:${ctx.dbUserId}`, 20, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many notifications. Try again later.' }, { status: 429 });
  }

  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = notifySchema.safeParse(requestBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid data', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { brokerageId, taggedUserId, message, senderName } = parsed.data;

  // Verify the brokerage matches the caller's brokerage
  if (brokerageId !== ctx.brokerage.id) {
    return NextResponse.json({ error: 'Brokerage mismatch' }, { status: 403 });
  }

  try {
    // Fetch the tagged user's email
    const { data: taggedUser } = await supabase
      .from('User')
      .select('email, name')
      .eq('id', taggedUserId)
      .maybeSingle();

    if (!taggedUser?.email) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify the tagged user is a member of this brokerage
    const { data: membership } = await supabase
      .from('BrokerageMembership')
      .select('id')
      .eq('brokerageId', brokerageId)
      .eq('userId', taggedUserId)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json(
        { error: 'Tagged user is not a brokerage member' },
        { status: 404 },
      );
    }

    // Send email via Resend
    if (!process.env.RESEND_API_KEY) {
      console.warn('[chat-notify] RESEND_API_KEY not set, skipping email');
      return NextResponse.json({ sent: false, reason: 'email not configured' });
    }

    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const rawFrom = process.env.RESEND_FROM_EMAIL ?? 'notifications@alerts.usechippi.com';
    const FROM = rawFrom.includes('@') ? rawFrom : `notifications@${rawFrom}`;

    // Truncate the message preview for email
    const preview =
      message.length > 200 ? message.slice(0, 200) + '...' : message;

    const safeSenderName = senderName
      .replace(/[\r\n\t]/g, ' ')
      .slice(0, 100);

    const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <tr><td style="background:#0f172a;padding:20px 28px">
          <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.05em">Team Chat</p>
          <p style="margin:4px 0 0;color:#ffffff;font-size:20px;font-weight:700">You were mentioned</p>
        </td></tr>
        <tr><td style="padding:24px 28px">
          <p style="margin:0 0 12px;font-size:15px;color:#111827;line-height:1.6">
            <strong>${safeSenderName}</strong> mentioned you in team chat:
          </p>
          <div style="background:#f8fafc;border-left:3px solid #f97316;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 20px">
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap">${preview.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td>
              <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://my.usechippi.com'}/broker/chat"
                 style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 22px;border-radius:8px">
                Open team chat
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #f1f5f9">
          <p style="margin:0;font-size:11px;color:#9ca3af">You're receiving this because you were mentioned in your brokerage team chat.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await resend.emails.send({
      from: FROM,
      to: taggedUser.email,
      subject: `${safeSenderName} mentioned you in team chat`,
      html,
    });

    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error('[chat-notify] error', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
