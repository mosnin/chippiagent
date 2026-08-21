/**
 * First-touch SMS for a new inbound lead.
 *
 * This is the product slice: a lead comes in, Chippi drafts one short text
 * in the assigned realtor's voice with two concrete showing windows, and
 * parks it in the approval inbox. Nothing is sent from here — there is no
 * send path, no autonomy override, no "just this once."
 *
 * Called from the event-trigger path (`fireAgentTrigger`) so the draft
 * exists in minutes even if Modal is slow, and again from the autonomous
 * run as a backstop when a trigger is drained later.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
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

export type FirstTouchAction = 'drafted' | 'deduped' | 'filled';

export interface FirstTouchDraftResult {
  action: FirstTouchAction;
  draftId: string;
  contactId: string;
  channel: 'sms';
  status: 'pending';
  content: string;
  windows: string[];
  sent: false;
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
    .select('id,name,address,properties,applicationData,spaceId')
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
  const { data: existingRows } = await supabase
    .from('AgentDraft')
    .select('id,content,status,channel')
    .eq('spaceId', input.spaceId)
    .eq('contactId', input.contactId)
    .eq('channel', 'sms')
    .eq('status', 'pending')
    .gte('createdAt', cutoff)
    .order('createdAt', { ascending: false })
    .limit(1);

  const existing = (existingRows ?? [])[0] as
    | { id: string; content: string | null; status: string; channel: string }
    | undefined;

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

  if (existing?.content?.trim()) {
    return {
      action: 'deduped',
      draftId: existing.id,
      contactId: input.contactId,
      channel: 'sms',
      status: 'pending',
      content: existing.content,
      windows: windows.map((w) => w.label),
      sent: false,
    };
  }

  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const row = {
    id: existing?.id ?? crypto.randomUUID(),
    spaceId: input.spaceId,
    contactId: input.contactId,
    channel: 'sms' as const,
    content,
    reasoning:
      'First-touch SMS for a new inbound lead — two showing windows, awaiting approval. Never sent.',
    priority: 80,
    status: 'pending' as const,
    expiresAt,
    updatedAt: now.toISOString(),
  };

  if (existing && !existing.content?.trim()) {
    const { error: updateError } = await supabase
      .from('AgentDraft')
      .update({
        content: row.content,
        reasoning: row.reasoning,
        priority: row.priority,
        status: 'pending',
        expiresAt: row.expiresAt,
        updatedAt: row.updatedAt,
      })
      .eq('id', existing.id)
      .eq('spaceId', input.spaceId);
    if (updateError) {
      logger.error('[first-touch] failed to fill empty draft', { spaceId: input.spaceId }, updateError);
      throw new Error('Failed to fill first-touch draft');
    }
    return {
      action: 'filled',
      draftId: existing.id,
      contactId: input.contactId,
      channel: 'sms',
      status: 'pending',
      content,
      windows: windows.map((w) => w.label),
      sent: false,
    };
  }

  const { data: inserted, error: insertError } = await supabase.from('AgentDraft').insert(row).select('id').maybeSingle();
  if (insertError) {
    logger.error('[first-touch] insert failed', { spaceId: input.spaceId }, insertError);
    throw new Error('Failed to create first-touch draft');
  }

  return {
    action: 'drafted',
    draftId: (inserted as { id?: string } | null)?.id ?? row.id,
    contactId: input.contactId,
    channel: 'sms',
    status: 'pending',
    content,
    windows: windows.map((w) => w.label),
    sent: false,
  };
}
