/**
 * Booking SMS after a lead replies to first-touch.
 *
 * First-touch offered two windows. When the lead texts back, Chippi
 * writes the next message that books the showing — confirm the time they
 * picked, or put two concrete windows in front of them again — and sends
 * it through Telnyx. No approval inbox. No pending persist. Missing
 * credentials fail.
 *
 * Called from the inbound_message trigger so the SMS goes out even if
 * Modal is slow, and again from the autonomous run as a backstop.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import {
  composeFirstTouchSms,
  firstNameOf,
  normalizeTone,
  proposeTwoShowingWindows,
  sendAutonomousSms,
  type AgentTone,
  type FirstTouchVoice,
  type ShowingWindow,
} from '@/lib/agent/first-touch';
import { isInboundMessageEvent } from '@/lib/agent/trigger-policy';

export type FirstTouchReplyAction = 'sent' | 'deduped' | 'filled' | 'skipped';

export interface FirstTouchReplyDraftResult {
  action: FirstTouchReplyAction;
  draftId?: string;
  contactId: string;
  channel: 'sms';
  status: 'sent' | 'skipped';
  content: string;
  windows: string[];
  picked?: string;
  sent: boolean;
  reason?: string;
}

export interface DraftFirstTouchReplyInput {
  spaceId: string;
  contactId: string;
  replyText?: string;
  sourceDraftId?: string;
  channel?: 'sms' | 'email';
  now?: Date;
}

const DEDUPE_WINDOW_HOURS = 48;
const FIRST_TOUCH_LOOKBACK_DAYS = 14;
const DEFAULT_TIMEZONE = 'America/New_York';
const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 17;
const DEFAULT_DAYS = [1, 2, 3, 4, 5];

const FIRST_TOUCH_REASON_MARK = 'First-touch SMS';
const REPLY_REASON = 'Reply to first-touch — book a showing. Sent.';

const WINDOW_LABEL_RE =
  /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}(?::\d{2})?(?:am|pm)\b/gi;

const DAY_ALIASES: Record<string, string[]> = {
  mon: ['mon', 'monday'],
  tue: ['tue', 'tues', 'tuesday'],
  wed: ['wed', 'wednesday'],
  thu: ['thu', 'thur', 'thurs', 'thursday'],
  fri: ['fri', 'friday'],
  sat: ['sat', 'saturday'],
  sun: ['sun', 'sunday'],
};

export function isInboundFirstTouchReplyEvent(event: string): boolean {
  return isInboundMessageEvent(event);
}

export function isFirstTouchDraft(row: { reasoning?: string | null }): boolean {
  return (row.reasoning ?? '').includes(FIRST_TOUCH_REASON_MARK);
}

export function isFirstTouchReplyDraft(row: { reasoning?: string | null }): boolean {
  return (row.reasoning ?? '').includes('Reply to first-touch');
}

export function extractWindowLabels(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.match(WINDOW_LABEL_RE) ?? []) {
    if (seen.has(match)) continue;
    seen.add(match);
    out.push(match);
  }
  return out;
}

export function pickOfferedWindow(reply: string, offered: string[]): string | undefined {
  if (!reply.trim() || offered.length === 0) return undefined;
  const lower = reply.toLowerCase();

  const exact = offered.filter((window) => lower.includes(window.toLowerCase()));
  if (exact.length === 1) return exact[0];

  const dayHits = offered.filter((window) => {
    const day = window.split(/\s+/)[0]?.toLowerCase().slice(0, 3);
    const aliases = DAY_ALIASES[day] ?? [day];
    return aliases.some((alias) => new RegExp(`\\b${alias}\\b`, 'i').test(reply));
  });
  if (dayHits.length === 1) return dayHits[0];

  const timeHits = offered.filter((window) => {
    const time = window.split(/\s+/)[1];
    return time && lower.includes(time.toLowerCase());
  });
  if (timeHits.length === 1) return timeHits[0];

  if (/\b(first|1st|earlier|the first one)\b/i.test(reply) && offered[0]) {
    return offered[0];
  }
  if (/\b(second|2nd|later|the other|the second)\b/i.test(reply) && offered[1]) {
    return offered[1];
  }
  return undefined;
}

export function composeFirstTouchReplySms(input: {
  contactFirstName: string;
  voice: FirstTouchVoice;
  windows: ShowingWindow[];
  picked?: string;
  property?: string;
}): string {
  const lead = firstNameOf(input.contactFirstName, 'there');
  const agent = firstNameOf(input.voice.agentFirstName, '');
  const who = agent || input.voice.businessName?.trim() || 'I';

  if (input.picked) {
    const picked = input.picked.trim();
    if (!picked) {
      throw new Error('first-touch reply draft is empty');
    }
    let text: string;
    switch (input.voice.tone) {
      case 'direct':
        text = `Hi ${lead} — ${who} here. ${picked} still work for you?`;
        break;
      case 'formal':
        text = `Hello ${lead}, this is ${who}. Would ${picked} still work for you?`;
        break;
      case 'casual':
        text = `Hey ${lead}! ${who} here — ${picked} still good?`;
        break;
      case 'warm':
      default:
        text = `Hey ${lead}, this is ${who}. I can do ${picked} — does that still work?`;
        break;
    }
    const content = text.replace(/\s+/g, ' ').trim();
    assertValidFirstTouchReplyText(content, {
      windows: [picked],
      agentToken: who,
      tone: input.voice.tone,
      picked,
    });
    return content;
  }

  return composeFirstTouchSms({
    contactFirstName: input.contactFirstName,
    voice: input.voice,
    windows: input.windows,
    property: input.property,
  });
}

export function assertValidFirstTouchReplyText(
  content: string,
  opts: { windows: string[]; agentToken: string; tone: AgentTone; picked?: string },
): void {
  if (!content.trim()) {
    throw new Error('first-touch reply draft is empty');
  }
  if (/\b(sent|delivered|auto-?sent)\b/i.test(content)) {
    throw new Error('first-touch reply draft claims it was sent');
  }
  if (
    /\b(booked|live|reserved|locked)\b/i.test(content) ||
    /\bis held\b/i.test(content) ||
    /\bi['’]ll lock\b/i.test(content) ||
    /\bsee you (then|there)\b/i.test(content)
  ) {
    throw new Error('first-touch reply draft claims the showing is booked');
  }
  if (/\bchippy\b/i.test(content)) {
    throw new Error('first-touch reply draft used the wrong brand spelling');
  }
  if (opts.agentToken && !content.includes(opts.agentToken)) {
    throw new Error('first-touch reply draft is not in the assigned agent voice');
  }
  if (opts.picked) {
    if (!content.includes(opts.picked)) {
      throw new Error(`first-touch reply draft missing confirmed window: ${opts.picked}`);
    }
    const confirmMarks: Record<AgentTone, RegExp> = {
      warm: /does that still work/i,
      direct: /still work for you/i,
      formal: /would .+ still work/i,
      casual: /still good/i,
    };
    if (!confirmMarks[opts.tone].test(content)) {
      throw new Error(`first-touch reply draft is not in the ${opts.tone} voice`);
    }
    return;
  }
  if (opts.windows.length < 2) {
    throw new Error('first-touch reply SMS requires two showing windows');
  }
  for (const window of opts.windows) {
    if (!content.includes(window)) {
      throw new Error(`first-touch reply draft missing showing window: ${window}`);
    }
  }
}

function propertyFromContact(contact: {
  address?: string | null;
  properties?: string[] | null;
  applicationData?: unknown;
}): string | undefined {
  if (contact.address?.trim()) return contact.address.trim();
  const listed = (contact.properties ?? []).find((p) => typeof p === 'string' && p.trim());
  if (listed) return listed.trim();
  const data = contact.applicationData;
  if (data && typeof data === 'object') {
    const rec = data as Record<string, unknown>;
    for (const key of ['address', 'propertyAddress', 'listingAddress', 'property', 'interestedProperty']) {
      const value = rec[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return undefined;
}

type DraftRow = {
  id: string;
  content: string | null;
  status: string;
  channel: string;
  reasoning?: string | null;
  createdAt?: string;
};

function skipped(
  contactId: string,
  reason: string,
): FirstTouchReplyDraftResult {
  return {
    action: 'skipped',
    contactId,
    channel: 'sms',
    status: 'skipped',
    content: '',
    windows: [],
    sent: false,
    reason,
  };
}

export async function draftFirstTouchReplyForLead(
  input: DraftFirstTouchReplyInput,
): Promise<FirstTouchReplyDraftResult> {
  if (!input.spaceId || !input.contactId) {
    throw new Error('spaceId and contactId are required');
  }
  if (input.channel && input.channel !== 'sms') {
    return skipped(input.contactId, 'not_sms');
  }

  const now = input.now ?? new Date();
  const { data: contact, error: contactError } = await supabase
    .from('Contact')
    .select('id,name,phone,address,properties,applicationData,spaceId')
    .eq('id', input.contactId)
    .eq('spaceId', input.spaceId)
    .maybeSingle();

  if (contactError) {
    logger.error('[first-touch-reply] contact lookup failed', { spaceId: input.spaceId }, contactError);
    throw new Error('Contact lookup failed');
  }
  if (!contact) {
    throw new Error('Contact not found in space');
  }

  const cutoff = new Date(now.getTime() - FIRST_TOUCH_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: existingRows, error: draftsError } = await supabase
    .from('AgentDraft')
    .select('id,content,status,channel,reasoning,createdAt')
    .eq('spaceId', input.spaceId)
    .eq('contactId', input.contactId)
    .eq('channel', 'sms')
    .gte('createdAt', cutoff)
    .order('createdAt', { ascending: false })
    .limit(20);
  if (draftsError) {
    logger.error('[first-touch-reply] draft lookup failed', { spaceId: input.spaceId }, draftsError);
    throw new Error('Draft lookup failed');
  }

  const drafts = (existingRows ?? []) as DraftRow[];
  const source = input.sourceDraftId
    ? drafts.find((row) => row.id === input.sourceDraftId && isFirstTouchDraft(row))
    : undefined;
  const firstTouch =
    (source && source.status !== 'dismissed' ? source : undefined) ??
    drafts.find((row) => isFirstTouchDraft(row) && row.status !== 'dismissed');

  if (!firstTouch) {
    return skipped(input.contactId, 'no_first_touch');
  }

  const replyCutoffMs = now.getTime() - DEDUPE_WINDOW_HOURS * 60 * 60 * 1000;
  const alreadySent = drafts.find((row) => {
    if (!isFirstTouchReplyDraft(row) || row.status !== 'sent' || !row.content?.trim()) return false;
    if (!row.createdAt) return true;
    return new Date(row.createdAt).getTime() >= replyCutoffMs;
  });
  const emptyStub = drafts.find((row) => {
    if (!isFirstTouchReplyDraft(row) || Boolean(row.content?.trim())) return false;
    if (!row.createdAt) return true;
    return new Date(row.createdAt).getTime() >= replyCutoffMs;
  });

  const [profileRes, settingRes, spaceRes] = await Promise.all([
    supabase
      .from('AIUserProfile')
      .select('displayName,communicationTone')
      .eq('spaceId', input.spaceId)
      .maybeSingle(),
    supabase
      .from('SpaceSetting')
      .select('businessName,timezone,tourStartHour,tourEndHour,tourDaysAvailable')
      .eq('spaceId', input.spaceId)
      .maybeSingle(),
    supabase.from('Space').select('name').eq('id', input.spaceId).maybeSingle(),
  ]);

  const profile = profileRes.data as { displayName?: string | null; communicationTone?: string | null } | null;
  const setting = settingRes.data as {
    businessName?: string | null;
    timezone?: string | null;
    tourStartHour?: number | null;
    tourEndHour?: number | null;
    tourDaysAvailable?: number[] | null;
  } | null;
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

  const offered = extractWindowLabels(firstTouch.content ?? '');
  const picked = pickOfferedWindow(input.replyText ?? '', offered);
  const windows = picked
    ? [{ startsAt: now, label: picked }]
    : proposeTwoShowingWindows(now, {
        timeZone: setting?.timezone ?? DEFAULT_TIMEZONE,
        startHour: setting?.tourStartHour ?? DEFAULT_START_HOUR,
        endHour: setting?.tourEndHour ?? DEFAULT_END_HOUR,
        daysAvailable: setting?.tourDaysAvailable ?? DEFAULT_DAYS,
      });
  if (!picked && windows.length < 2) {
    throw new Error('could not propose two showing windows');
  }

  const content = composeFirstTouchReplySms({
    contactFirstName: firstNameOf(contact.name, 'there'),
    voice,
    windows,
    picked,
    property: propertyFromContact(contact),
  });
  if (!content.trim()) {
    throw new Error('first-touch reply draft is empty');
  }

  const windowLabels = picked ? [picked] : windows.map((w) => w.label);

  if (alreadySent) {
    return {
      action: 'deduped',
      draftId: alreadySent.id,
      contactId: input.contactId,
      channel: 'sms',
      status: 'sent',
      content: alreadySent.content!,
      windows: windowLabels,
      picked,
      sent: true,
    };
  }

  await sendAutonomousSms({
    to: (contact as { phone?: string | null }).phone,
    body: content,
    label: 'first-touch-reply',
  });

  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const row = {
    id: emptyStub?.id ?? crypto.randomUUID(),
    spaceId: input.spaceId,
    contactId: input.contactId,
    channel: 'sms' as const,
    content,
    reasoning: REPLY_REASON,
    priority: 85,
    status: 'sent' as const,
    expiresAt,
    updatedAt: now.toISOString(),
  };

  if (emptyStub) {
    const { data: updated, error: updateError } = await supabase
      .from('AgentDraft')
      .update({
        content: row.content,
        reasoning: row.reasoning,
        priority: row.priority,
        status: 'sent',
        expiresAt: row.expiresAt,
        updatedAt: row.updatedAt,
      })
      .eq('id', emptyStub.id)
      .eq('spaceId', input.spaceId)
      .select('id');
    if (!updateError && updated && updated.length > 0) {
      return {
        action: 'filled',
        draftId: emptyStub.id,
        contactId: input.contactId,
        channel: 'sms',
        status: 'sent',
        content,
        windows: windowLabels,
        picked,
        sent: true,
      };
    }
    if (updateError) {
      logger.error('[first-touch-reply] failed to record sent SMS', { spaceId: input.spaceId }, updateError);
    }
    row.id = crypto.randomUUID();
  }

  const { data: inserted, error: insertError } = await supabase
    .from('AgentDraft')
    .insert(row)
    .select('id')
    .maybeSingle();
  if (insertError) {
    logger.error('[first-touch-reply] insert failed', { spaceId: input.spaceId }, insertError);
    throw new Error('Failed to record first-touch reply SMS');
  }

  return {
    action: 'sent',
    draftId: (inserted as { id?: string } | null)?.id ?? row.id,
    contactId: input.contactId,
    channel: 'sms',
    status: 'sent',
    content,
    windows: windowLabels,
    picked,
    sent: true,
  };
}
