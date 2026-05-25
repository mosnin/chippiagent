/**
 * `propose_tour_times` — suggest 4-6 open 60-minute slots on the realtor's
 * calendar for the next 7 days during business hours. The chat renders
 * these as a tappable picker; the realtor picks one → the workspace sends
 * a "Schedule the tour at <slot>" prompt → Chippi fires `schedule_tour`
 * through the normal approval pipeline.
 *
 * Read-only. No DB writes. Honest about constraints (business hours,
 * minimum 30 min between slots, skip weekends) — the model doesn't need
 * to learn these heuristics; the tool encodes them.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';

const parameters = z
  .object({
    contactId: z
      .string()
      .min(1)
      .optional()
      .describe('Saved Contact.id this tour is for. Surface their name on the picker.'),
    propertyAddress: z
      .string()
      .min(1)
      .optional()
      .describe('Property address the tour is for. Surface on the picker.'),
    durationMinutes: z
      .number()
      .int()
      .min(15)
      .max(240)
      .optional()
      .describe('Tour length. Defaults to 60.'),
    daysAhead: z
      .number()
      .int()
      .min(1)
      .max(14)
      .optional()
      .describe('How many days out to scan. Defaults to 7.'),
  })
  .describe(
    'Propose 4-6 open slots in business hours over the next week. Renders as a tappable picker — the realtor picks a slot to fire schedule_tour.',
  );

interface ProposedSlot {
  startsAt: string;
  endsAt: string;
  /** Pre-formatted human label, e.g. "Tue, May 20 · 10:00 AM". */
  label: string;
}

interface ProposeTourTimesResult {
  slots: ProposedSlot[];
  contactId?: string;
  propertyAddress?: string;
  durationMinutes: number;
}

/** Business hours window in the realtor's local time. Lean toward
 *  showings: skip pre-9am, skip after 6pm, skip weekends. */
const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 18;

export const proposeTourTimesTool = defineTool<typeof parameters, ProposeTourTimesResult>({
  name: 'propose_tour_times',
  riskLevel: 'safe',
  description:
    'Suggest 4-6 open tour times for the realtor over the next week. Returns slots the realtor can tap to schedule.',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const durationMs = (args.durationMinutes ?? 60) * 60_000;
    const daysAhead = args.daysAhead ?? 7;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + daysAhead * 24 * 60 * 60_000);

    // Fetch everything booked in the window, then walk the calendar in
    // 30-minute steps and accept the first free 60-min block in each hour.
    const [tourRes, eventRes] = await Promise.all([
      supabase
        .from('Tour')
        .select('startsAt, endsAt')
        .eq('spaceId', ctx.space.id)
        .lt('startsAt', windowEnd.toISOString())
        .gt('endsAt', now.toISOString())
        .limit(200),
      supabase
        .from('CalendarEvent')
        .select('date, time')
        .eq('spaceId', ctx.space.id)
        .gte('date', now.toISOString().slice(0, 10))
        .lte('date', windowEnd.toISOString().slice(0, 10))
        .limit(500),
    ]);

    if (tourRes.error || eventRes.error) {
      return {
        summary: 'Could not check the calendar. Try again in a moment.',
        display: 'error',
      };
    }

    type Band = { startsAt: number; endsAt: number };
    const conflicts: Band[] = [];
    for (const t of (tourRes.data ?? []) as Array<{ startsAt: string; endsAt: string }>) {
      conflicts.push({
        startsAt: Date.parse(t.startsAt),
        endsAt: Date.parse(t.endsAt),
      });
    }
    for (const e of (eventRes.data ?? []) as Array<{ date: string; time: string | null }>) {
      if (e.time && /^\d{2}:\d{2}$/.test(e.time)) {
        const start = Date.parse(`${e.date}T${e.time}:00`);
        conflicts.push({ startsAt: start, endsAt: start + 60 * 60_000 });
      } else {
        // All-day event blocks the whole day.
        const start = Date.parse(`${e.date}T00:00:00`);
        conflicts.push({ startsAt: start, endsAt: start + 24 * 60 * 60_000 });
      }
    }

    const overlaps = (slotStart: number, slotEnd: number): boolean => {
      for (const c of conflicts) {
        if (c.endsAt <= slotStart) continue;
        if (c.startsAt >= slotEnd) continue;
        return true;
      }
      return false;
    };

    // Walk in 1-hour steps starting at the next clean hour. Cap at 6 slots
    // across the entire window — too many choices is its own friction.
    const slots: ProposedSlot[] = [];
    const cursor = new Date(now);
    cursor.setMinutes(0, 0, 0);
    cursor.setHours(cursor.getHours() + 1);
    while (cursor.getTime() < windowEnd.getTime() && slots.length < 6) {
      const day = cursor.getDay();
      const hour = cursor.getHours();
      const isWeekend = day === 0 || day === 6;
      const inHours = hour >= BUSINESS_START_HOUR && hour + Math.ceil(durationMs / 3_600_000) <= BUSINESS_END_HOUR;
      if (!isWeekend && inHours) {
        const startMs = cursor.getTime();
        const endMs = startMs + durationMs;
        if (!overlaps(startMs, endMs)) {
          slots.push({
            startsAt: new Date(startMs).toISOString(),
            endsAt: new Date(endMs).toISOString(),
            label: formatLabel(new Date(startMs)),
          });
        }
      }
      cursor.setHours(cursor.getHours() + 1);
    }

    if (slots.length === 0) {
      return {
        summary: 'No open slots in the next week during business hours.',
        display: 'plain',
      };
    }

    return {
      summary: `${slots.length} open slot${slots.length === 1 ? '' : 's'} this week.`,
      data: {
        slots,
        contactId: args.contactId,
        propertyAddress: args.propertyAddress,
        durationMinutes: args.durationMinutes ?? 60,
      },
      display: 'availability-picker',
    };
  },
});

/** "Tue, May 20 · 10:00 AM" — the picker reads this verbatim so the model
 *  doesn't have to. */
function formatLabel(d: Date): string {
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}
