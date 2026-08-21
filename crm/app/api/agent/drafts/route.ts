import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { audit } from '@/lib/audit';
import { sendDraft, type DeliveryResult } from '@/lib/delivery';
import { DRAFT_FAILED_SIGNAL } from '@/lib/draft-stats';

const VALID_CHANNELS = ['sms', 'email', 'note'] as const;
type Channel = (typeof VALID_CHANNELS)[number];

const DEDUPE_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * GET /api/agent/drafts
 *
 * Lists drafts for the realtor's space. Default status is `sent` — this
 * endpoint is a send log, not an approval inbox. Pass ?status=pending to
 * see leftover review-queue rows from older writers.
 */
export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const status = req.nextUrl.searchParams.get('status') ?? 'sent';
  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10);
  const limit = Math.min(isNaN(limitParam) ? 50 : limitParam, 100);

  const { data, error } = await supabase
    .from('AgentDraft')
    .select(`
      id, contactId, dealId, channel, subject, content, reasoning,
      priority, status, confidence, expiresAt, createdAt, updatedAt,
      Contact:contactId ( id, name, email, phone )
    `)
    .eq('spaceId', space.id)
    .eq('status', status)
    .order('priority', { ascending: false })
    .order('createdAt', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return NextResponse.json(data ?? []);
}

/**
 * POST /api/agent/drafts
 *
 * Create-and-send. There is no pending write. The existing SMS/email
 * path (`sendDraft`) fires first; the AgentDraft row is persisted after
 * with status `sent` or (on delivery failure) `approved` +
 * feedback_action `rejected` + outcome_signal `failed`.
 *
 * A failed send is an HTTP error. A pending row is never a success.
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const contactId = typeof body.contactId === 'string' ? body.contactId : '';
  const channel = body.channel;
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const dealId = typeof body.dealId === 'string' ? body.dealId : null;
  const reasoning = typeof body.reasoning === 'string' ? body.reasoning : null;
  const priority =
    typeof body.priority === 'number' && Number.isFinite(body.priority)
      ? Math.max(0, Math.min(100, Math.floor(body.priority)))
      : 0;

  if (!contactId) {
    return NextResponse.json({ error: 'contactId required' }, { status: 400 });
  }
  if (!VALID_CHANNELS.includes(channel as Channel)) {
    return NextResponse.json({ error: 'channel must be sms, email, or note' }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: 'content required' }, { status: 400 });
  }
  if (channel === 'email' && !subject) {
    return NextResponse.json({ error: 'subject required for email' }, { status: 400 });
  }

  const { data: contact, error: contactErr } = await supabase
    .from('Contact')
    .select('id, name, email, phone')
    .eq('id', contactId)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (contactErr) {
    return NextResponse.json({ error: 'Contact lookup failed' }, { status: 500 });
  }
  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  const cutoff = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
  const { data: existing } = await supabase
    .from('AgentDraft')
    .select('id, channel, content, createdAt, status')
    .eq('spaceId', space.id)
    .eq('contactId', contactId)
    .eq('channel', channel)
    .eq('status', 'sent')
    .gte('createdAt', cutoff)
    .order('createdAt', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      action: 'deduped',
      id: existing.id,
      status: 'sent',
      contactId,
      channel,
      note: 'A sent draft for this contact already exists from the last 48h.',
    });
  }

  const deliveryResult: DeliveryResult = await sendDraft(
    {
      channel: channel as Channel,
      subject: channel === 'email' ? subject : null,
      content,
    },
    { name: contact.name ?? 'Contact', email: contact.email, phone: contact.phone },
    space.name,
    { spaceId: space.id, userId },
  );

  const now = new Date().toISOString();
  const sent = deliveryResult.sent === true;
  // status is never pending on this write — sent, or approved (failed send).
  const row: Record<string, unknown> = {
    spaceId: space.id,
    contactId,
    dealId,
    channel,
    subject: channel === 'email' ? subject : null,
    content,
    reasoning,
    priority,
    status: sent ? 'sent' : 'approved',
    feedback_action: sent ? 'approved' : 'rejected',
    edit_distance: 0,
    updatedAt: now,
  };
  if (!sent) row.outcome_signal = DRAFT_FAILED_SIGNAL;

  const { data: inserted, error: insertError } = await supabase
    .from('AgentDraft')
    .insert(row)
    .select()
    .single();

  if (insertError) {
    if (sent) {
      return NextResponse.json(
        {
          error: 'Message sent but draft row failed to persist',
          status: 'sent',
          deliveryResult,
        },
        { status: 200 },
      );
    }
    return NextResponse.json({ error: 'Failed to record draft' }, { status: 500 });
  }

  void audit({
    actorClerkId: userId,
    action: 'CREATE',
    resource: 'AgentDraft',
    resourceId: inserted.id,
    spaceId: space.id,
    metadata: {
      source: 'drafts-create',
      channel,
      contactId,
      finalStatus: row.status,
      deliverySent: sent,
      deliveryError: deliveryResult.error,
    },
  });

  if (!sent) {
    return NextResponse.json(
      {
        error: deliveryResult.error ?? 'Delivery failed',
        id: inserted.id,
        status: inserted.status,
        deliveryResult,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    action: 'sent',
    id: inserted.id,
    status: 'sent',
    contactId,
    channel,
    deliveryResult,
  });
}
