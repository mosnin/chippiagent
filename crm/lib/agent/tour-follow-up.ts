/**
 * Follow-up SMS after a showing actually finishes.
 *
 * The tour PATCH already fires `tour_completed`. This writes one short
 * text in the assigned realtor's voice and sends it through Telnyx. The
 * follow-up is an ask — how did it feel, do they want to talk next —
 * never a claim that a deal closed or a time is booked / reserved /
 * locked / held.
 *
 * No approval inbox. No pending persist. Missing credentials fail.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import {
  firstNameOf,
  listingFromTourOrContact,
  normalizeTone,
  sendAutonomousSms,
  type AgentTone,
  type FirstTouchVoice,
} from '@/lib/agent/first-touch';
import { isTourCompletedEvent } from '@/lib/agent/trigger-policy';

export type TourFollowUpAction = 'sent' | 'deduped' | 'filled' | 'skipped';

export interface TourFollowUpDraftResult {
  action: TourFollowUpAction;
  draftId?: string;
  contactId: string;
  channel: 'sms';
  status: 'sent' | 'skipped';
  content: string;
  sent: boolean;
  reason?: string;
}

export interface ComposeTourFollowUpInput {
  contactFirstName: string;
  voice: FirstTouchVoice;
  property?: string;
}

export interface DraftTourFollowUpInput {
  spaceId: string;
  contactId: string;
  tourId?: string;
  now?: Date;
}

const DEDUPE_WINDOW_HOURS = 48;
const REASON_MARK = 'Tour-completed follow-up SMS';
const REASON = 'Tour-completed follow-up SMS — ask how the showing felt. Sent.';

export function isTourCompletedFollowUpEvent(event: string): boolean {
  return isTourCompletedEvent(event);
}

export function isTourFollowUpDraft(row: { reasoning?: string | null }): boolean {
  return (row.reasoning ?? '').includes(REASON_MARK);
}

export function assertSentDraftPersist(row: { status: string }): void {
  if (row.status === 'pending') {
    throw new Error('tour-follow-up persist must not stay pending');
  }
  if (row.status !== 'sent') {
    throw new Error('tour-follow-up persist must be sent');
  }
}

export function composeTourFollowUpSms(input: ComposeTourFollowUpInput): string {
  const lead = firstNameOf(input.contactFirstName, 'there');
  const agent = firstNameOf(input.voice.agentFirstName, '');
  const who = agent || input.voice.businessName?.trim() || 'I';
  const property = input.property?.trim();
  const place = property || 'the showing';

  let text: string;
  switch (input.voice.tone) {
    case 'direct':
      text = `Hi ${lead} — ${who} here. Thoughts on ${place}? Ready to talk next?`;
      break;
    case 'formal':
      text = `Hello ${lead}, this is ${who}. How was ${
        property ? `the showing at ${property}` : 'the showing'
      }? Would you like to discuss next steps?`;
      break;
    case 'casual':
      text = `Hey ${lead}! ${who} here — how'd ${place} feel? Want to chat next steps?`;
      break;
    case 'warm':
    default:
      text = `Hey ${lead}, this is ${who}. How did ${place} feel? Want to talk next steps?`;
      break;
  }

  const content = text.replace(/\s+/g, ' ').trim();
  assertValidTourFollowUpText(content, { agentToken: who, tone: input.voice.tone });
  return content;
}

export function assertValidTourFollowUpText(
  content: string,
  opts: { agentToken: string; tone: AgentTone },
): void {
  if (!content.trim()) {
    throw new Error('tour-follow-up draft is empty');
  }
  if (/\b(sent|delivered|auto-?sent)\b/i.test(content)) {
    throw new Error('tour-follow-up draft claims it was sent');
  }
  if (
    /\b(booked|live|reserved|locked|held)\b/i.test(content) ||
    /\bis held\b/i.test(content) ||
    /\bi['’]ll lock\b/i.test(content) ||
    /\bsee you (then|there)\b/i.test(content)
  ) {
    throw new Error('tour-follow-up draft claims the showing is booked');
  }
  if (
    /\b(deal is closed|we closed|closed the deal|it['’]s closed|you(?:'ve| have)? closed)\b/i.test(
      content,
    )
  ) {
    throw new Error('tour-follow-up draft claims the deal is closed');
  }
  if (/\bchippy\b/i.test(content)) {
    throw new Error('tour-follow-up draft used the wrong brand spelling');
  }
  if (opts.agentToken && !content.includes(opts.agentToken)) {
    throw new Error('tour-follow-up draft is not in the assigned agent voice');
  }
  const toneMarks: Record<AgentTone, RegExp> = {
    warm: /this is|want to talk next/i,
    direct: /thoughts on|ready to talk next/i,
    formal: /would you like to discuss/i,
    casual: /how'd|want to chat next/i,
  };
  if (!toneMarks[opts.tone].test(content)) {
    throw new Error(`tour-follow-up draft is not in the ${opts.tone} voice`);
  }
}

function skipped(contactId: string, reason: string): TourFollowUpDraftResult {
  return {
    action: 'skipped',
    contactId,
    channel: 'sms',
    status: 'skipped',
    content: '',
    sent: false,
    reason,
  };
}

type DraftRow = {
  id: string;
  content: string | null;
  status: string;
  channel: string;
  reasoning?: string | null;
  createdAt?: string;
};

export async function draftTourFollowUpForContact(
  input: DraftTourFollowUpInput,
): Promise<TourFollowUpDraftResult> {
  if (!input.spaceId || !input.contactId) {
    throw new Error('spaceId and contactId are required');
  }

  const now = input.now ?? new Date();
  const { data: contact, error: contactError } = await supabase
    .from('Contact')
    .select('id,name,phone,address,preferences,properties,applicationData,spaceId')
    .eq('id', input.contactId)
    .eq('spaceId', input.spaceId)
    .maybeSingle();

  if (contactError) {
    logger.error('[tour-follow-up] contact lookup failed', { spaceId: input.spaceId }, contactError);
    throw new Error('Contact lookup failed');
  }
  if (!contact) {
    throw new Error('Contact not found in space');
  }

  let tourQuery = supabase
    .from('Tour')
    .select('id,status,propertyAddress,contactId,spaceId,updatedAt')
    .eq('spaceId', input.spaceId)
    .eq('status', 'completed');
  tourQuery = input.tourId
    ? tourQuery.eq('id', input.tourId)
    : tourQuery.eq('contactId', input.contactId);
  const { data: tourRows } = await tourQuery.order('updatedAt', { ascending: false }).limit(1);
  const tour = ((tourRows ?? [])[0] ?? null) as {
    id: string;
    status: string;
    propertyAddress?: string | null;
    contactId?: string | null;
    spaceId?: string;
  } | null;

  if (!tour || tour.status !== 'completed') {
    return skipped(input.contactId, 'no_completed_tour');
  }
  if (tour.contactId && tour.contactId !== input.contactId) {
    return skipped(input.contactId, 'tour_contact_mismatch');
  }

  const cutoff = new Date(now.getTime() - DEDUPE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data: existingRows } = await supabase
    .from('AgentDraft')
    .select('id,content,status,channel,reasoning,createdAt')
    .eq('spaceId', input.spaceId)
    .eq('contactId', input.contactId)
    .eq('channel', 'sms')
    .gte('createdAt', cutoff)
    .order('createdAt', { ascending: false })
    .limit(20);

  const drafts = (existingRows ?? []) as DraftRow[];
  const alreadySent = drafts.find(
    (row) => isTourFollowUpDraft(row) && row.status === 'sent' && Boolean(row.content?.trim()),
  );
  const emptyStub = drafts.find((row) => isTourFollowUpDraft(row) && !row.content?.trim());

  const [profileRes, settingRes, spaceRes] = await Promise.all([
    supabase
      .from('AIUserProfile')
      .select('displayName,communicationTone')
      .eq('spaceId', input.spaceId)
      .maybeSingle(),
    supabase.from('SpaceSetting').select('businessName').eq('spaceId', input.spaceId).maybeSingle(),
    supabase.from('Space').select('name').eq('id', input.spaceId).maybeSingle(),
  ]);

  const profile = profileRes.data as { displayName?: string | null; communicationTone?: string | null } | null;
  const setting = settingRes.data as { businessName?: string | null } | null;
  const space = spaceRes.data as { name?: string | null } | null;

  const voice: FirstTouchVoice = {
    tone: normalizeTone(profile?.communicationTone),
    agentFirstName: firstNameOf(profile?.displayName, ''),
    businessName: setting?.businessName?.trim() || space?.name?.trim() || undefined,
  };
  if (!voice.agentFirstName && voice.businessName) {
    voice.agentFirstName = voice.businessName;
  }
  if (!voice.agentFirstName) {
    voice.agentFirstName = 'I';
  }

  const content = composeTourFollowUpSms({
    contactFirstName: firstNameOf(contact.name, 'there'),
    voice,
    property: listingFromTourOrContact(tour, contact),
  });
  if (!content.trim()) {
    throw new Error('tour-follow-up draft is empty');
  }

  if (alreadySent) {
    return {
      action: 'deduped',
      draftId: alreadySent.id,
      contactId: input.contactId,
      channel: 'sms',
      status: 'sent',
      content: alreadySent.content!,
      sent: true,
    };
  }

  await sendAutonomousSms({
    to: (contact as { phone?: string | null }).phone,
    body: content,
    label: 'tour-follow-up',
  });

  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const row = {
    id: emptyStub?.id ?? crypto.randomUUID(),
    spaceId: input.spaceId,
    contactId: input.contactId,
    channel: 'sms' as const,
    content,
    reasoning: REASON,
    priority: 82,
    status: 'sent' as const,
    expiresAt,
    updatedAt: now.toISOString(),
  };
  assertSentDraftPersist(row);

  if (emptyStub) {
    const update = {
      content: row.content,
      reasoning: row.reasoning,
      priority: row.priority,
      status: 'sent' as const,
      expiresAt: row.expiresAt,
      updatedAt: row.updatedAt,
    };
    assertSentDraftPersist(update);
    const { error: updateError } = await supabase
      .from('AgentDraft')
      .update(update)
      .eq('id', emptyStub.id)
      .eq('spaceId', input.spaceId);
    if (updateError) {
      logger.error('[tour-follow-up] failed to record sent SMS', { spaceId: input.spaceId }, updateError);
      throw new Error('Failed to record tour-follow-up SMS');
    }
    return {
      action: 'filled',
      draftId: emptyStub.id,
      contactId: input.contactId,
      channel: 'sms',
      status: 'sent',
      content,
      sent: true,
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('AgentDraft')
    .insert(row)
    .select('id')
    .maybeSingle();
  if (insertError) {
    logger.error('[tour-follow-up] insert failed', { spaceId: input.spaceId }, insertError);
    throw new Error('Failed to record tour-follow-up SMS');
  }

  return {
    action: 'sent',
    draftId: (inserted as { id?: string } | null)?.id ?? row.id,
    contactId: input.contactId,
    channel: 'sms',
    status: 'sent',
    content,
    sent: true,
  };
}
