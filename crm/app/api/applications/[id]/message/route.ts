import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireContactAccess } from '@/lib/api-auth';

/**
 * POST /api/applications/[id]/message
 *
 * Auth'd endpoint for realtors to send messages to applicants.
 * Creates an ApplicationMessage with senderType: 'realtor'.
 * Sends email notification to applicant.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: contactId } = await params;

  const auth = await requireContactAccess(contactId);
  if (auth instanceof NextResponse) return auth;

  let body: { content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { content } = body;

  if (!content || content.trim().length === 0) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  if (content.trim().length > 2000) {
    return NextResponse.json({ error: 'Message too long (max 2000 characters)' }, { status: 400 });
  }

  // Strip HTML tags for XSS prevention
  const sanitized = content.trim().replace(/<[^>]*>/g, '');

  // Get contact details for email notification
  const { data: contact, error: fetchError } = await supabase
    .from('Contact')
    .select('email, name, spaceId, applicationRef, statusPortalToken')
    .eq('id', contactId)
    .single();

  if (fetchError || !contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  // Create the message
  const { data: message, error: insertError } = await supabase
    .from('ApplicationMessage')
    .insert({
      contactId,
      spaceId: contact.spaceId,
      senderType: 'realtor',
      content: sanitized,
    })
    .select('id, senderType, content, createdAt')
    .single();

  if (insertError) {
    console.error('[message] Insert error:', insertError);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }

  // Send email to applicant (fire and forget)
  if (contact.email) {
    sendMessageNotification(contact, sanitized).catch((err) =>
      console.error('[message] Email notification failed:', err),
    );
  }

  return NextResponse.json({ message }, { status: 201 });
}

/**
 * GET /api/applications/[id]/message
 *
 * Auth'd endpoint to fetch all messages for a contact.
 * Returns messages ordered by createdAt ascending.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: contactId } = await params;

  const auth = await requireContactAccess(contactId);
  if (auth instanceof NextResponse) return auth;

  const { data: messages, error } = await supabase
    .from('ApplicationMessage')
    .select('id, senderType, content, readAt, createdAt')
    .eq('contactId', contactId)
    .order('createdAt', { ascending: true });

  if (error) {
    console.error('[message] Fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }

  // Mark unread applicant messages as read
  const unreadApplicantIds = (messages ?? [])
    .filter((m: { senderType: string; readAt: string | null }) => m.senderType === 'applicant' && !m.readAt)
    .map((m: { id: string }) => m.id);

  if (unreadApplicantIds.length > 0) {
    await supabase
      .from('ApplicationMessage')
      .update({ readAt: new Date().toISOString() })
      .in('id', unreadApplicantIds);
  }

  return NextResponse.json({ messages: messages ?? [] });
}

async function sendMessageNotification(
  contact: {
    email: string | null;
    name: string;
    spaceId: string;
    applicationRef: string | null;
    statusPortalToken: string | null;
  },
  messageContent: string,
): Promise<void> {
  if (!contact.email || !process.env.RESEND_API_KEY) return;

  const [{ data: space }, { data: settings }] = await Promise.all([
    supabase.from('Space').select('slug, name').eq('id', contact.spaceId).maybeSingle(),
    supabase
      .from('SpaceSetting')
      .select('businessName')
      .eq('spaceId', contact.spaceId)
      .maybeSingle(),
  ]);

  const businessName = settings?.businessName ?? space?.name ?? 'Your Agent';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://my.usechippi.com';

  let portalUrl = '';
  if (space?.slug && contact.applicationRef) {
    portalUrl = `${appUrl}/apply/${encodeURIComponent(space.slug)}/status?ref=${encodeURIComponent(contact.applicationRef)}`;
    if (contact.statusPortalToken) {
      portalUrl += `&token=${encodeURIComponent(contact.statusPortalToken)}`;
    }
  }

  const safeBizName = businessName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeContent = messageContent.replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 500);

  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM =
    process.env.RESEND_FROM_EMAIL?.includes('@')
      ? process.env.RESEND_FROM_EMAIL
      : `notifications@${process.env.RESEND_FROM_EMAIL ?? 'alerts.usechippi.com'}`;

  await resend.emails.send({
    from: `${businessName.replace(/[\r\n\t<>"]/g, ' ').slice(0, 100)} <${FROM}>`,
    to: contact.email,
    subject: `New message from ${businessName.replace(/[\r\n\t]/g, ' ').slice(0, 100)}`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <tr><td style="background:#0f172a;padding:20px 28px">
          <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700">${safeBizName}</p>
        </td></tr>
        <tr><td style="padding:24px 28px">
          <p style="margin:0 0 12px;font-size:14px;color:#374151">You have a new message regarding your application:</p>
          <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:12px 0">
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap">${safeContent}</p>
          </div>
          ${portalUrl ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px">
            <tr><td>
              <a href="${portalUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 22px;border-radius:8px">View your application &rarr;</a>
            </td></tr>
          </table>
          ` : ''}
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #f1f5f9">
          <p style="margin:0;font-size:11px;color:#9ca3af">This email was sent by ${safeBizName} via Chippi</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}
