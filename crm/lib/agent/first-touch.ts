/**
 * First-touch SMS for a new inbound lead.
 *
 * A lead comes in, Chippi writes one short text in the assigned realtor's
 * voice with two concrete showing windows, and sends it through the real
 * Telnyx path. No approval inbox. No pending persist. Missing credentials
 * fail — they do not fall back to a parked draft.
 *
 * Called from the event-trigger path (`fireAgentTrigger`) so the SMS goes
 * out even if Modal is slow, and again from the autonomous run as a
 * backstop when a trigger is drained later.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { sendSMS } from '@/lib/sms';
import { isInboundLeadEvent } from '@/lib/agent/trigger-policy';

export type AgentTone = 'warm' | 'direct' | 'formal' | 'casual';

export interface ShowingWindow {
  startsAt: Date;
  label: string;
}

export interface FirstTouchVoice {
  tone: AgentTone;
  agentFirstName: string;
  businessName?: string;
}

export interface ComposeFirstTouchInput {
  contactFirstName: string;
  voice: FirstTouchVoice;
  windows: ShowingWindow[];
  property?: string;
}

export type FirstTouchAction = 'sent' | 'deduped' | 'filled';

export interface FirstTouchDraftResult {
  action: FirstTouchAction;
  draftId: string;
  contactId: string;
  channel: 'sms';
  status: 'sent';
  content: string;
  windows: string[];
  sent: true;
}

export const FIRST_TOUCH_REASON_MARK = 'First-touch SMS';
const FIRST_TOUCH_REASON = 'First-touch SMS for a new inbound lead — two showing windows. Sent.';

export function isFirstTouchDraft(row: { reasoning?: string | null }): boolean {
  return (row.reasoning ?? '').includes(FIRST_TOUCH_REASON_MARK);
}

export async function sendAutonomousSms(input: {
  to: string | null | undefined;
  body: string;
  label: string;
}): Promise<void> {
  const phone = (input.to ?? '').trim();
  if (!phone) {
    throw new Error(`${input.label} SMS send failed: contact has no phone number`);
  }
  if (!process.env.TELNYX_API_KEY || !process.env.TELNYX_FROM_NUMBER) {
    throw new Error(`${input.label} SMS send failed: Telnyx credentials missing`);
  }
  const delivered = await sendSMS({ to: phone, body: input.body });
  if (!delivered) {
    throw new Error(`${input.label} SMS send failed`);
  }
}

export interface DraftFirstTouchInput {
  spaceId: string;
  contactId: string;
  now?: Date;
}

const DEDUPE_WINDOW_HOURS = 48;
const DEFAULT_TIMEZONE = 'America/New_York';
const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 17;
const DEFAULT_DAYS = [1, 2, 3, 4, 5];

export function normalizeTone(raw: string | null | undefined): AgentTone {
  const tone = (raw ?? '').trim().toLowerCase();
  if (tone === 'direct' || tone === 'formal' || tone === 'casual' || tone === 'warm') {
    return tone;
  }
  return 'warm';
}

export function firstNameOf(full: string | null | undefined, fallback = 'there'): string {
  const part = (full ?? '').trim().split(/\s+/).filter(Boolean)[0];
  return part || fallback;
}

export function isInboundFirstTouchEvent(event: string): boolean {
  return isInboundLeadEvent(event);
}

export function formatWindowLabel(at: Date, timeZone: string): string {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(at);
  return `${weekday} ${compactClock(time)}`;
}

function compactClock(time: string): string {
  const trimmed = time.replace(/\s+/g, '').toLowerCase();
  return trimmed.replace(':00', '');
}

function zonedParts(at: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dow: number;
  dayKey: string;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const dowMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  return {
    year,
    month,
    day,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    dow: dowMap[get('weekday')] ?? 0,
    dayKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

function preferredHours(startHour: number, endHour: number): number[] {
  const lastOpen = Math.max(startHour, endHour - 1);
  const morning = Math.min(Math.max(startHour, 11), lastOpen);
  const afternoon = Math.min(Math.max(startHour, 16), lastOpen);
  if (morning === afternoon) {
    const later = Math.min(morning + 3, lastOpen);
    return later === morning ? [morning] : [morning, later];
  }
  return [morning, afternoon];
}

export function proposeTwoShowingWindows(
  now: Date,
  opts: {
    timeZone?: string;
    startHour?: number;
    endHour?: number;
    daysAvailable?: number[];
  } = {},
): ShowingWindow[] {
  const timeZone = opts.timeZone?.trim() || DEFAULT_TIMEZONE;
  const startHour = Number.isFinite(opts.startHour) ? Number(opts.startHour) : DEFAULT_START_HOUR;
  const endHour = Number.isFinite(opts.endHour) ? Number(opts.endHour) : DEFAULT_END_HOUR;
  const daysAvailable =
    opts.daysAvailable && opts.daysAvailable.length > 0 ? opts.daysAvailable : DEFAULT_DAYS;
  const preferred = new Set(preferredHours(startHour, endHour));

  const preferredHits: Date[] = [];
  const anyHits: Date[] = [];
  const cursor = new Date(now.getTime());
  cursor.setUTCMinutes(0, 0, 0);
  cursor.setUTCHours(cursor.getUTCHours() + 1);
  const horizon = now.getTime() + 14 * 24 * 60 * 60 * 1000;

  while (cursor.getTime() < horizon && (preferredHits.length < 4 || anyHits.length < 6)) {
    const z = zonedParts(cursor, timeZone);
    const inHours = z.minute === 0 && daysAvailable.includes(z.dow) && z.hour >= startHour && z.hour < endHour;
    if (inHours && cursor.getTime() > now.getTime() + 45 * 60 * 1000) {
      anyHits.push(new Date(cursor.getTime()));
      if (preferred.has(z.hour)) preferredHits.push(new Date(cursor.getTime()));
    }
    cursor.setUTCHours(cursor.getUTCHours() + 1);
  }

  const picked = pickTwoWindows([...preferredHits, ...anyHits], timeZone);
  return picked.map((startsAt) => ({
    startsAt,
    label: formatWindowLabel(startsAt, timeZone),
  }));
}

function pickTwoWindows(candidates: Date[], timeZone: string): Date[] {
  const unique: Date[] = [];
  const seen = new Set<number>();
  for (const d of candidates) {
    if (seen.has(d.getTime())) continue;
    seen.add(d.getTime());
    unique.push(d);
  }

  const out: Date[] = [];
  const days = new Set<string>();
  for (const d of unique) {
    const key = zonedParts(d, timeZone).dayKey;
    if (out.length === 0 || !days.has(key)) {
      out.push(d);
      days.add(key);
    }
    if (out.length === 2) return out;
  }
  for (const d of unique) {
    if (!out.some((x) => x.getTime() === d.getTime())) out.push(d);
    if (out.length === 2) return out;
  }
  return out;
}

export function composeFirstTouchSms(input: ComposeFirstTouchInput): string {
  if (input.windows.length < 2) {
    throw new Error('first-touch SMS requires two showing windows');
  }
  const lead = firstNameOf(input.contactFirstName, 'there');
  const agent = firstNameOf(input.voice.agentFirstName, '');
  const who = agent || input.voice.businessName?.trim() || 'I';
  const w1 = input.windows[0].label;
  const w2 = input.windows[1].label;
  const property = input.property?.trim();
  const place = property ? `${property} is available. ` : '';

  let text: string;
  switch (input.voice.tone) {
    case 'direct':
      text = `Hi ${lead} — ${who} here. ${place}I can hold ${w1} or ${w2}. Which works?`;
      break;
    case 'formal':
      text = `Hello ${lead}, this is ${who}${
        input.voice.businessName ? ` with ${input.voice.businessName}` : ''
      }. ${place}I have ${w1} or ${w2} available. Which would you prefer?`;
      break;
    case 'casual':
      text = `Hey ${lead}! ${who} here — ${place || 'want to come see the place? '}${w1} or ${w2} work for me.`;
      break;
    case 'warm':
    default:
      text = `Hey ${lead}, this is ${who}. ${place}I can do ${w1} or ${w2} — which works?`;
      break;
  }

  const content = text.replace(/\s+/g, ' ').trim();
  assertValidFirstTouchText(content, {
    windows: [w1, w2],
    agentToken: who,
    tone: input.voice.tone,
  });
  return content;
}

export function assertValidFirstTouchText(
  content: string,
  opts: { windows: string[]; agentToken: string; tone: AgentTone },
): void {
  if (!content.trim()) {
    throw new Error('first-touch draft is empty');
  }
  if (/\b(sent|delivered|auto-?sent)\b/i.test(content)) {
    throw new Error('first-touch draft claims it was sent');
  }
  if (
    /\b(booked|live|reserved|locked)\b/i.test(content) ||
    /\bis held\b/i.test(content) ||
    /\bi['’]ll lock\b/i.test(content) ||
    /\bsee you (then|there)\b/i.test(content)
  ) {
    throw new Error('first-touch draft claims the showing is booked');
  }
  for (const window of opts.windows) {
    if (!content.includes(window)) {
      throw new Error(`first-touch draft missing showing window: ${window}`);
    }
  }
  if (opts.agentToken && !content.includes(opts.agentToken)) {
    throw new Error('first-touch draft is not in the assigned agent voice');
  }
  if (/\bchippy\b/i.test(content)) {
    throw new Error('first-touch draft used the wrong brand spelling');
  }
  const toneMarks: Record<AgentTone, RegExp> = {
    warm: /this is|which works/i,
    direct: /i can hold/i,
    formal: /would you prefer/i,
    casual: /work for me/i,
  };
  if (!toneMarks[opts.tone].test(content)) {
    throw new Error(`first-touch draft is not in the ${opts.tone} voice`);
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

export async function draftFirstTouchForLead(
  input: DraftFirstTouchInput,
): Promise<FirstTouchDraftResult> {
  if (!input.spaceId || !input.contactId) {
    throw new Error('spaceId and contactId are required');
  }

  const now = input.now ?? new Date();
  const { data: contact, error: contactError } = await supabase
    .from('Contact')
    .select('id,name,phone,address,properties,applicationData,spaceId')
    .eq('id', input.contactId)
    .eq('spaceId', input.spaceId)
    .maybeSingle();

  if (contactError) {
    logger.error('[first-touch] contact lookup failed', { spaceId: input.spaceId }, contactError);
    throw new Error('Contact lookup failed');
  }
  if (!contact) {
    throw new Error('Contact not found in space');
  }

  const cutoff = new Date(now.getTime() - DEDUPE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data: existingRows, error: draftsError } = await supabase
    .from('AgentDraft')
    .select('id,content,status,channel,reasoning')
    .eq('spaceId', input.spaceId)
    .eq('contactId', input.contactId)
    .eq('channel', 'sms')
    .gte('createdAt', cutoff)
    .order('createdAt', { ascending: false })
    .limit(20);
  if (draftsError) {
    logger.error('[first-touch] draft lookup failed', { spaceId: input.spaceId }, draftsError);
    throw new Error('Draft lookup failed');
  }

  const drafts = (existingRows ?? []) as Array<{
    id: string;
    content: string | null;
    status: string;
    channel: string;
    reasoning?: string | null;
  }>;
  const alreadySent = drafts.find(
    (row) => isFirstTouchDraft(row) && row.status === 'sent' && Boolean(row.content?.trim()),
  );
  const emptyStub = drafts.find((row) => isFirstTouchDraft(row) && !row.content?.trim());

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

  const windows = proposeTwoShowingWindows(now, {
    timeZone: setting?.timezone ?? DEFAULT_TIMEZONE,
    startHour: setting?.tourStartHour ?? DEFAULT_START_HOUR,
    endHour: setting?.tourEndHour ?? DEFAULT_END_HOUR,
    daysAvailable: setting?.tourDaysAvailable ?? DEFAULT_DAYS,
  });
  if (windows.length < 2) {
    throw new Error('could not propose two showing windows');
  }

  const content = composeFirstTouchSms({
    contactFirstName: firstNameOf(contact.name, 'there'),
    voice,
    windows,
    property: propertyFromContact(contact),
  });
  const windowLabels = windows.map((w) => w.label);

  if (alreadySent) {
    return {
      action: 'deduped',
      draftId: alreadySent.id,
      contactId: input.contactId,
      channel: 'sms',
      status: 'sent',
      content: alreadySent.content!,
      windows: windowLabels,
      sent: true,
    };
  }

  await sendAutonomousSms({
    to: (contact as { phone?: string | null }).phone,
    body: content,
    label: 'first-touch',
  });

  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const row = {
    id: emptyStub?.id ?? crypto.randomUUID(),
    spaceId: input.spaceId,
    contactId: input.contactId,
    channel: 'sms' as const,
    content,
    reasoning: FIRST_TOUCH_REASON,
    priority: 80,
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
        sent: true,
      };
    }
    if (updateError) {
      logger.error('[first-touch] failed to record sent SMS', { spaceId: input.spaceId }, updateError);
    }
    // Stub vanished or the update wrote zero rows — insert a new sent
    // receipt so the SMS is not invisible to the next run.
    row.id = crypto.randomUUID();
  }

  const { data: inserted, error: insertError } = await supabase.from('AgentDraft').insert(row).select('id').maybeSingle();
  if (insertError) {
    logger.error('[first-touch] insert failed', { spaceId: input.spaceId }, insertError);
    throw new Error('Failed to record first-touch SMS');
  }

  return {
    action: 'sent',
    draftId: (inserted as { id?: string } | null)?.id ?? row.id,
    contactId: input.contactId,
    channel: 'sms',
    status: 'sent',
    content,
    windows: windowLabels,
    sent: true,
  };
}
