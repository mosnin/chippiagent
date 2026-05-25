import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const SEGMENTS = [
  'all',
  'onboarded',
  'not_onboarded',
  'trial',
  'active',
  'past_due',
  'canceled',
  'no_workspace',
] as const;

type Segment = (typeof SEGMENTS)[number];

const SUBSCRIPTION_SEGMENTS: Record<string, string> = {
  trial: 'trialing',
  active: 'active',
  past_due: 'past_due',
  canceled: 'canceled',
};

const BULK_LIMIT = 5000;
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 250;

type UserRow = { id: string; email: string; name: string | null };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function getFromAddress(): string {
  const raw = process.env.RESEND_FROM_EMAIL ?? 'notifications@alerts.usechippi.com';
  if (raw.includes('@')) return raw;
  return `notifications@${raw}`;
}

function renderBroadcastHtml(subject: string, body: string): string {
  // Admin body is trusted — they may supply HTML. Subject is escaped for safety.
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <tr><td style="background:#0f172a;padding:20px 28px">
          <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700">Chippi</p>
        </td></tr>
        <tr><td style="padding:28px;font-size:15px;color:#111827;line-height:1.6">
          <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0f172a">${escapeHtml(subject)}</h1>
          <div>${body}</div>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #f1f5f9">
          <p style="margin:0;font-size:11px;color:#9ca3af">You're receiving this because you have a Chippi account.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function fetchSegmentUsers(segment: Segment, limit: number): Promise<UserRow[]> {
  if (segment === 'all') {
    const { data, error } = await supabase
      .from('User')
      .select('id, email, name')
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as UserRow[];
  }

  if (segment === 'onboarded' || segment === 'not_onboarded') {
    const { data, error } = await supabase
      .from('User')
      .select('id, email, name')
      .eq('onboard', segment === 'onboarded')
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as UserRow[];
  }

  if (segment in SUBSCRIPTION_SEGMENTS) {
    const status = SUBSCRIPTION_SEGMENTS[segment];
    const { data: spaces, error: spaceErr } = await supabase
      .from('Space')
      .select('ownerId')
      .eq('stripeSubscriptionStatus', status)
      .limit(limit);
    if (spaceErr) throw spaceErr;
    const ownerIds = (spaces ?? []).map((s: { ownerId: string }) => s.ownerId);
    if (ownerIds.length === 0) return [];
    const { data, error } = await supabase
      .from('User')
      .select('id, email, name')
      .in('id', ownerIds)
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as UserRow[];
  }

  if (segment === 'no_workspace') {
    const { data: spaces, error: spaceErr } = await supabase
      .from('Space')
      .select('ownerId');
    if (spaceErr) throw spaceErr;
    const owned = new Set((spaces ?? []).map((s: { ownerId: string }) => s.ownerId));
    const { data, error } = await supabase
      .from('User')
      .select('id, email, name')
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as UserRow[]).filter((u) => !owned.has(u.id));
  }

  return [];
}

export async function POST(req: NextRequest) {
  let admin: { userId: string };
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const emailBody = typeof body.body === 'string' ? body.body : '';
  const segment = body.segment as Segment;
  const preview = body.preview === true;

  if (subject.length < 1 || subject.length > 200) {
    return NextResponse.json(
      { error: 'Subject must be 1-200 characters' },
      { status: 400 },
    );
  }
  if (emailBody.length < 1 || emailBody.length > 50_000) {
    return NextResponse.json(
      { error: 'Body must be 1-50000 characters' },
      { status: 400 },
    );
  }
  if (!SEGMENTS.includes(segment)) {
    return NextResponse.json({ error: 'Invalid segment' }, { status: 400 });
  }

  // Only rate-limit actual sends; previews are cheap and used interactively.
  if (!preview) {
    const { allowed } = await checkRateLimit(`broadcast:${admin.userId}`, 3, 3600);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded: max 3 broadcasts per hour' },
        { status: 429 },
      );
    }
  }

  let users: UserRow[];
  try {
    users = await fetchSegmentUsers(segment, BULK_LIMIT);
  } catch (err) {
    console.error('[broadcast] failed to fetch segment users', err);
    return NextResponse.json({ error: 'Failed to load recipients' }, { status: 500 });
  }

  const recipientCount = users.length;

  if (preview) {
    return NextResponse.json({
      recipientCount,
      sampleEmails: users.slice(0, 5).map((u) => u.email),
    });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: 'RESEND_API_KEY is not configured' },
      { status: 500 },
    );
  }

  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = `Chippi <${getFromAddress()}>`;
  const safeSubject = subject.replace(/[\r\n\t]/g, ' ').slice(0, 200);

  let sentCount = 0;
  let failedCount = 0;

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((u) => {
        const personalizedBody = emailBody.replace(/\{name\}/g, escapeHtml(u.name ?? 'there'));
        const html = renderBroadcastHtml(subject, personalizedBody);
        return resend.emails.send({
          from: FROM,
          to: u.email,
          subject: safeSubject,
          html,
        });
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && !r.value.error) sentCount++;
      else failedCount++;
    }
    if (i + BATCH_SIZE < users.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  const broadcastId = crypto.randomUUID();
  const { error: insertErr } = await supabase.from('EmailBroadcast').insert({
    id: broadcastId,
    subject,
    body: emailBody,
    segment,
    recipientCount,
    sentCount,
    failedCount,
    sentBy: admin.userId,
    createdAt: new Date().toISOString(),
  });
  if (insertErr) {
    console.error('[broadcast] failed to log EmailBroadcast', insertErr);
  }

  await logAdminAction({
    actor: admin.userId,
    action: 'broadcast_email',
    target: broadcastId,
    details: { subject, segment, recipientCount, sentCount, failedCount },
  });

  return NextResponse.json({
    success: true,
    broadcastId,
    recipientCount,
    sentCount,
    failedCount,
  });
}
