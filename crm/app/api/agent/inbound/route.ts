/**
 * POST /api/agent/inbound
 *
 * Webhook called by SMS/email providers when a contact replies.
 * Records the inbound message as a ContactActivity and optionally
 * marks the source AgentDraft as having received a response.
 *
 * Secured with AGENT_INTERNAL_SECRET (not user auth — this is a webhook).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fireAgentTrigger } from '@/lib/agent/fire-trigger';
import { firstNameOf } from '@/lib/agent/first-touch';
import { sendSMS } from '@/lib/sms';

export async function POST(req: NextRequest) {
  const secret = process.env.AGENT_INTERNAL_SECRET ?? '';
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }

  const auth = req.headers.get('authorization');
  if (!auth || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { contactId: string; spaceId: string; channel: 'sms' | 'email'; content: string; draftId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { contactId, spaceId, channel, content, draftId } = body as {
    contactId: string;
    spaceId: string;
    channel: 'sms' | 'email';
    content: string;
    draftId?: string;
  };

  if (!contactId || !spaceId || !channel || !content) {
    return NextResponse.json({ error: 'Missing required fields: contactId, spaceId, channel, content' }, { status: 400 });
  }
  if (typeof content !== 'string' || content.length > 5000) {
    return NextResponse.json({ error: 'content must be 5000 characters or fewer' }, { status: 400 });
  }

  const validChannels = ['sms', 'email'];
  if (!validChannels.includes(channel)) {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });
  }

  // Validate contact belongs to the stated space
  const { data: contact } = await supabase
    .from('Contact')
    .select('id, name, phone, leadScore')
    .eq('id', contactId)
    .eq('spaceId', spaceId)
    .maybeSingle();

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  const now = new Date().toISOString();

  // Record as ContactActivity
  const { error: activityError } = await supabase.from('ContactActivity').insert({
    id: crypto.randomUUID(),
    contactId,
    spaceId,
    type: 'note',
    content: `[Inbound ${channel.toUpperCase()}] ${content.slice(0, 500)}`,
    metadata: {
      source: 'inbound',
      channel,
      draftId: draftId ?? null,
    },
  });
  if (activityError) {
    console.error('[agent/inbound] ContactActivity insert failed', activityError);
    return NextResponse.json({ error: 'Failed to record message' }, { status: 500 });
  }

  // Update lastContactedAt
  await supabase
    .from('Contact')
    .update({ lastContactedAt: now, updatedAt: now })
    .eq('id', contactId)
    .eq('spaceId', spaceId);

  // Mark draft as responded
  if (draftId) {
    await supabase
      .from('AgentDraft')
      .update({ outcome: 'responded', outcomeDetectedAt: now })
      .eq('id', draftId)
      .eq('spaceId', spaceId);
  }

  // Fire + send. Do not park a pending draft — inbound_message proceeds
  // without a human queue. The wake still happens so the autonomous run
  // can continue the thread; the SMS leaves now.
  try {
    const trigger = await fireAgentTrigger({
      spaceId,
      event: 'inbound_message',
      contactId,
      content,
      channel,
      sourceDraftId: draftId,
    });
    await sendInboundReplyNow({
      spaceId,
      contactId,
      phone: contact.phone,
      contactName: contact.name,
      alreadySent: trigger.firstTouchReply?.sent === true,
      body: trigger.firstTouchReply?.content,
    });
  } catch (e) {
    console.error('[agent/inbound] agent trigger/send failed (non-fatal):', e);
  }

  return NextResponse.json({ recorded: true, contactId, channel });
}

async function sendInboundReplyNow(input: {
  spaceId: string;
  contactId: string;
  phone?: string | null;
  contactName?: string | null;
  alreadySent?: boolean;
  body?: string | null;
}): Promise<void> {
  if (input.alreadySent) return;
  const phone = input.phone?.trim();
  if (!phone) return;

  let body = input.body?.trim() ?? '';
  if (!body) {
    const lead = firstNameOf(input.contactName, 'there');
    body = `Hey ${lead}, got your message — which time works for you?`;
  }
  if (/\bchippy\b/i.test(body)) return;

  const sent = await sendSMS({ to: phone, body });
  if (!sent) return;

  const { error } = await supabase.from('ContactActivity').insert({
    id: crypto.randomUUID(),
    contactId: input.contactId,
    spaceId: input.spaceId,
    type: 'note',
    content: `SMS: ${body.slice(0, 140)}${body.length > 140 ? '…' : ''}`,
    metadata: { channel: 'sms', via: 'trigger_send', event: 'inbound_message' },
  });
  if (error) {
    console.error('[agent/inbound] send activity insert failed', error);
  }
}
