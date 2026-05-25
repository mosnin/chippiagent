import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/applications/portal/message
 *
 * Public endpoint — applicant sends a message via token auth.
 * Rate limited to 10 messages per token per hour.
 */
export async function POST(req: NextRequest) {
  let body: { applicationRef?: string; token?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { applicationRef, token, content } = body;

  if (!applicationRef || !token || !content) {
    return NextResponse.json(
      { error: 'applicationRef, token, and content are required' },
      { status: 400 },
    );
  }

  // Validate token format to reject obviously invalid inputs before DB lookup
  if (
    typeof applicationRef !== 'string' || applicationRef.length < 10 || applicationRef.length > 64 ||
    typeof token !== 'string' || token.length < 32 || token.length > 128 ||
    typeof content !== 'string'
  ) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  // Validate content length
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
  }
  if (trimmed.length > 2000) {
    return NextResponse.json({ error: 'Message too long (max 2000 characters)' }, { status: 400 });
  }

  // Rate limit by IP to prevent abuse (token is user-controlled, so also limit by IP)
  const ip = getClientIp(req);
  const { allowed: ipAllowed } = await checkRateLimit(`portal:msg:ip:${ip}`, 30, 3600);
  if (!ipAllowed) {
    return NextResponse.json(
      { error: 'Too many messages. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  // Also rate limit per token to prevent per-application spam
  // Truncate token to prevent rate-limit key manipulation with excessively long strings
  const tokenKey = typeof token === 'string' ? token.slice(0, 64) : 'invalid';
  const { allowed } = await checkRateLimit(`portal:msg:${tokenKey}`, 10, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many messages. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  // Validate token + ref match
  const { data: contact, error: contactError } = await supabase
    .from('Contact')
    .select('id, spaceId, name, email')
    .eq('applicationRef', applicationRef)
    .eq('statusPortalToken', token)
    .maybeSingle();

  if (contactError) {
    console.error('[portal/message] Contact lookup error:', contactError);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  if (!contact) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  // Sanitize message content using allowlist approach for permitted characters.
  // Only allow: alphanumeric, spaces, basic punctuation, and common unicode letters.
  // This is more robust than regex-based HTML stripping.
  let sanitized = trimmed
    // Remove null bytes and control characters first
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Allow only: letters, numbers, spaces, newlines, tabs, and basic punctuation
    // Basic punctuation: . , ! ? ; : ' " - _ @ # $ % & * ( ) / + = [ ] { } ~ ` ^
    .replace(/[^\w\s.,!?;:'"@#$%&*()\-/+=\[\]{}~`^\n\r\t]/g, '');

  // Create the message
  const { data: message, error: insertError } = await supabase
    .from('ApplicationMessage')
    .insert({
      contactId: contact.id,
      spaceId: contact.spaceId,
      senderType: 'applicant',
      content: sanitized,
    })
    .select('id, senderType, content, createdAt')
    .single();

  if (insertError) {
    console.error('[portal/message] Insert error:', insertError);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }

  // Notify realtor via email (fire and forget)
  notifyRealtorOfMessage(contact.spaceId, contact.name, sanitized).catch((err) =>
    console.error('[portal/message] Realtor notification failed:', err),
  );

  return NextResponse.json({ message }, { status: 201 });
}

/**
 * Send email notification to realtor about new applicant message.
 */
async function notifyRealtorOfMessage(
  spaceId: string,
  applicantName: string,
  messageContent: string,
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;

  const [{ data: space }, { data: settings }] = await Promise.all([
    supabase.from('Space').select('ownerId, name, slug').eq('id', spaceId).maybeSingle(),
    supabase
      .from('SpaceSetting')
      .select('notifications, businessName')
      .eq('spaceId', spaceId)
      .maybeSingle(),
  ]);

  if (!space) return;
  if (settings && !settings.notifications) return;

  const { data: owner } = await supabase
    .from('User')
    .select('email')
    .eq('id', space.ownerId)
    .maybeSingle();

  if (!owner?.email) return;

  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM =
    process.env.RESEND_FROM_EMAIL?.includes('@')
      ? process.env.RESEND_FROM_EMAIL
      : `notifications@${process.env.RESEND_FROM_EMAIL ?? 'alerts.usechippi.com'}`;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://my.usechippi.com';
  const safeName = applicantName.replace(/[\r\n\t]/g, ' ').slice(0, 100);
  const safeContent = messageContent.replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 500);

  await resend.emails.send({
    from: FROM,
    to: owner.email,
    subject: `New message from applicant: ${safeName}`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <tr><td style="background:#0f172a;padding:20px 28px">
          <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.05em">${space.name}</p>
          <p style="margin:4px 0 0;color:#ffffff;font-size:20px;font-weight:700">New applicant message</p>
        </td></tr>
        <tr><td style="padding:24px 28px">
          <p style="margin:0 0 8px;font-size:14px;color:#6b7280">From <strong style="color:#111827">${safeName}</strong>:</p>
          <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:12px 0">
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap">${safeContent}</p>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px">
            <tr><td>
              <a href="${appUrl}/s/${space.slug}/contacts" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 22px;border-radius:8px">View in dashboard &rarr;</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #f1f5f9">
          <p style="margin:0;font-size:11px;color:#9ca3af">You're receiving this because an applicant sent a message through the status portal.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}
