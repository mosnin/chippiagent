/**
 * POST /api/agent/send
 *
 * Internal endpoint — called by the Modal background agent to send email or
 * SMS directly when a space's autonomy_level is "autonomous".
 *
 * When autonomy_level is "draft_required" or "suggest_only", the agent calls
 * create_draft_message instead and this endpoint is never reached.
 *
 * Security model (matches /api/agent/rescore-contact):
 *   - Bearer AGENT_INTERNAL_SECRET header required
 *   - spaceId is validated from the request body against the DB — the agent
 *     injects its own spaceId from AgentContext, never from LLM output
 *   - contactId is validated to belong to the spaceId before sending
 *   - Rate-limiting is handled upstream in the Python outreach tool
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendEmailFromCRM } from '@/lib/email';
import { sendSMS } from '@/lib/sms';

const AGENT_INTERNAL_SECRET = process.env.AGENT_INTERNAL_SECRET ?? '';

const VALID_CHANNELS = new Set(['email', 'sms']);

export async function POST(req: NextRequest) {
  if (!AGENT_INTERNAL_SECRET) {
    console.error('[agent/send] AGENT_INTERNAL_SECRET is not configured');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }

  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${AGENT_INTERNAL_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { contactId, spaceId, channel, content, subject, runId } = body as {
    contactId: string;
    spaceId: string;
    channel: string;
    content: string;
    subject?: string;
    runId?: string;
  };

  if (!contactId || !spaceId || !channel || !content) {
    return NextResponse.json({ error: 'contactId, spaceId, channel, content required' }, { status: 400 });
  }

  if (!VALID_CHANNELS.has(channel)) {
    return NextResponse.json({ error: `Invalid channel "${channel}". Must be email or sms.` }, { status: 400 });
  }

  if (channel === 'email' && !subject) {
    return NextResponse.json({ error: 'subject required for email channel' }, { status: 400 });
  }

  // Validate contact belongs to this space — the spaceId check is the
  // tenant isolation boundary. Never trust the LLM's contactId without it.
  const { data: contact, error: contactErr } = await supabase
    .from('Contact')
    .select('id, name, email, phone')
    .eq('id', contactId)
    .eq('spaceId', spaceId)
    .maybeSingle();

  if (contactErr) {
    console.error('[agent/send] contact lookup error', contactErr);
    return NextResponse.json({ error: 'Contact lookup failed' }, { status: 500 });
  }
  if (!contact) {
    return NextResponse.json({ error: 'Contact not found in space' }, { status: 404 });
  }

  // Resolve sender display name from SpaceSetting, same as the on-demand agent
  const { data: spaceSetting } = await supabase
    .from('SpaceSetting')
    .select('businessName')
    .eq('spaceId', spaceId)
    .maybeSingle();
  const fromName = (spaceSetting?.businessName as string | undefined) ?? spaceId;

  let deliveredTo: string | null = null;

  if (channel === 'email') {
    if (!contact.email) {
      return NextResponse.json({ error: `${contact.name} has no email on file` }, { status: 422 });
    }

    try {
      await sendEmailFromCRM({
        toEmail: contact.email,
        fromName,
        subject: subject!,
        body: content,
      });
      deliveredTo = contact.email;
    } catch (err) {
      console.error('[agent/send] email delivery failed', err);
      return NextResponse.json({ error: 'Email delivery failed' }, { status: 502 });
    }
  }

  if (channel === 'sms') {
    if (!contact.phone) {
      return NextResponse.json({ error: `${contact.name} has no phone on file` }, { status: 422 });
    }

    const ok = await sendSMS({ to: contact.phone, body: content });
    if (!ok) {
      return NextResponse.json({ error: 'SMS delivery failed — check Telnyx config' }, { status: 502 });
    }
    deliveredTo = contact.phone;
  }

  // Audit the send to the contact's activity feed — non-fatal
  try {
    await supabase.from('ContactActivity').insert({
      id: crypto.randomUUID(),
      spaceId,
      contactId,
      type: channel === 'email' ? 'email' : 'note',
      content: channel === 'email'
        ? `[Agent] Email sent: ${subject}`
        : `[Agent] SMS sent: ${content.slice(0, 140)}${content.length > 140 ? '…' : ''}`,
      metadata: {
        channel,
        source: 'background_agent',
        ...(runId ? { agentRunId: runId } : {}),
        ...(channel === 'sms' ? { via: 'sms' } : {}),
      },
    });
  } catch (err) {
    console.error('[agent/send] activity log failed (non-fatal)', err);
  }

  return NextResponse.json({ success: true, channel, deliveredTo });
}
