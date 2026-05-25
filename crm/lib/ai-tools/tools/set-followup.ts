/**
 * `set_followup` — schedule a follow-up date on a contact.
 *
 * Approval-gated: changing followUpAt moves the contact in the Today inbox
 * and morning story, so the realtor wants to see what's being scheduled.
 *
 * Accepts ISO-8601 dates ("2026-05-08") OR natural relative phrases
 * ("today", "tomorrow", "Friday", "next Tuesday"). We resolve to a midnight-
 * UTC ISO timestamp before storing. If the phrase doesn't parse we error
 * out instead of guessing — silent date-guessing is how follow-ups get lost.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    personId: z.string().min(1).describe('The Contact.id to set a follow-up on.'),
    when: z
      .string()
      .min(1)
      .max(60)
      .describe(
        'ISO date ("2026-05-08") or relative phrase ("today", "tomorrow", "Friday", "next Tuesday").',
      ),
    note: z
      .string()
      .max(500)
      .optional()
      .describe('Why we are following up. Becomes the activity-log line.'),
  })
  .describe('Schedule a follow-up on a contact.');

interface SetFollowupResult {
  contactId: string;
  followUpAt: string;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

/**
 * Resolve a date phrase to a midnight-UTC ISO string. Returns null if we
 * can't confidently parse it.
 */
export function resolveWhen(input: string, now: Date = new Date()): string | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  // ISO-8601 (date or full datetime) — let Date parse it.
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const startOfDayUTC = (d: Date) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

  if (raw === 'today') return startOfDayUTC(now).toISOString();
  if (raw === 'tomorrow') {
    const t = startOfDayUTC(now);
    t.setUTCDate(t.getUTCDate() + 1);
    return t.toISOString();
  }

  // "next Mon", "next monday"
  const nextMatch = raw.match(/^next\s+([a-z]+)$/);
  if (nextMatch) {
    const dow = WEEKDAYS[nextMatch[1]];
    if (dow === undefined) return null;
    const t = startOfDayUTC(now);
    const cur = t.getUTCDay();
    let delta = (dow - cur + 7) % 7;
    if (delta === 0) delta = 7;
    delta += 7; // "next" = following week, not this week
    t.setUTCDate(t.getUTCDate() + delta);
    return t.toISOString();
  }

  // Bare weekday — closest upcoming occurrence (today included if it matches).
  if (WEEKDAYS[raw] !== undefined) {
    const dow = WEEKDAYS[raw];
    const t = startOfDayUTC(now);
    const cur = t.getUTCDay();
    let delta = (dow - cur + 7) % 7;
    if (delta === 0) delta = 7;
    t.setUTCDate(t.getUTCDate() + delta);
    return t.toISOString();
  }

  return null;
}

export const setFollowupTool = defineTool<typeof parameters, SetFollowupResult>({
  name: 'set_followup',
  riskLevel: 'low',
  description:
    "Schedule a follow-up on a contact. Accepts ISO date or 'today'/'tomorrow'/weekday/'next <weekday>'. Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 200, windowSeconds: 3600 },
  summariseCall(args) {
    return `Set follow-up on contact ${args.personId.slice(0, 8)} → ${args.when}`;
  },

  async handler(args, ctx) {
    const iso = resolveWhen(args.when);
    if (!iso) {
      return {
        summary: `Couldn't parse "${args.when}" as a date. Use ISO ("2026-05-08") or a phrase like "Friday" or "next Tuesday".`,
        display: 'error',
      };
    }

    const { data: contact, error: lookupErr } = await supabase
      .from('Contact')
      .select('id, name')
      .eq('id', args.personId)
      .eq('spaceId', ctx.space.id)
      .is('brokerageId', null)
      .maybeSingle();
    if (lookupErr) {
      return { summary: `Contact lookup failed: ${lookupErr.message}`, display: 'error' };
    }
    if (!contact) {
      return {
        summary: `No contact with id "${args.personId}" in this workspace.`,
        display: 'error',
      };
    }

    const { error: updateErr } = await supabase
      .from('Contact')
      .update({ followUpAt: iso, updatedAt: new Date().toISOString() })
      .eq('id', args.personId)
      .eq('spaceId', ctx.space.id);
    if (updateErr) {
      logger.error(
        '[tools.set_followup] update failed',
        { contactId: args.personId },
        updateErr,
      );
      return { summary: `Update failed: ${updateErr.message}`, display: 'error' };
    }

    const content = args.note ?? `Follow up by ${args.when}`;
    const { error: activityErr } = await supabase.from('ContactActivity').insert({
      id: crypto.randomUUID(),
      contactId: args.personId,
      spaceId: ctx.space.id,
      type: 'follow_up',
      content,
      metadata: { followUpAt: iso, via: 'on_demand_agent' },
    });
    if (activityErr) {
      logger.warn(
        '[tools.set_followup] activity insert failed',
        { contactId: args.personId },
        activityErr,
      );
    }

    return {
      summary: `Follow-up set for ${contact.name || 'contact'} → ${iso.slice(0, 10)}.`,
      data: { contactId: args.personId, followUpAt: iso },
      display: 'success',
    };
  },
});
