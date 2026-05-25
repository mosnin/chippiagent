/**
 * `reschedule_tour` — move a Tour to a new start (and optional end) time.
 *
 * Approval-gated: tours are on calendars and inboxes; the realtor sees
 * the new time before we commit. Google Calendar sync runs server-side
 * on a separate cron job (see schedule-tour.ts), so we don't duplicate
 * it here — same stance as the create path.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    tourId: z.string().min(1).describe('The Tour.id to reschedule.'),
    newStartsAt: z.string().datetime().describe('New ISO start time.'),
    newEndsAt: z
      .string()
      .datetime()
      .optional()
      .describe('Optional new ISO end. Defaults to preserving the original duration.'),
    why: z.string().max(500).optional(),
  })
  .describe('Move a tour to a new time.');

interface RescheduleTourResult {
  tourId: string;
  startsAt: string;
  endsAt: string;
}

function pretty(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const rescheduleTourTool = defineTool<typeof parameters, RescheduleTourResult>({
  name: 'reschedule_tour',
  riskLevel: 'low',
  description:
    'Move a tour to a new time. Preserves the original duration unless newEndsAt is given. Prompts for approval first.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 60, windowSeconds: 3600 },
  summariseCall(args) {
    const why = args.why ? ` — ${args.why}` : '';
    return `Reschedule tour ${args.tourId.slice(0, 8)} → ${pretty(args.newStartsAt)}${why}`;
  },

  async handler(args, ctx) {
    const { data: tour, error: tourErr } = await supabase
      .from('Tour')
      .select('id, startsAt, endsAt, contactId, propertyAddress, guestName, status')
      .eq('id', args.tourId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (tourErr) {
      return { summary: `Tour lookup failed: ${tourErr.message}`, display: 'error' };
    }
    if (!tour) {
      return { summary: `No tour with that id.`, display: 'error' };
    }
    if (tour.status === 'cancelled') {
      return { summary: `That tour is already cancelled — schedule a new one instead.`, display: 'error' };
    }

    const newStarts = new Date(args.newStartsAt);
    let newEnds: Date;
    if (args.newEndsAt) {
      newEnds = new Date(args.newEndsAt);
      if (newEnds <= newStarts) {
        return { summary: `End time must be after start time.`, display: 'error' };
      }
    } else {
      // Preserve original duration.
      const oldStart = new Date(tour.startsAt as string).getTime();
      const oldEnd = new Date(tour.endsAt as string).getTime();
      const duration = Math.max(15 * 60 * 1000, oldEnd - oldStart);
      newEnds = new Date(newStarts.getTime() + duration);
    }

    const { error: updateErr } = await supabase
      .from('Tour')
      .update({
        startsAt: newStarts.toISOString(),
        endsAt: newEnds.toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .eq('id', args.tourId)
      .eq('spaceId', ctx.space.id);
    if (updateErr) {
      logger.error('[tools.reschedule_tour] update failed', { tourId: args.tourId }, updateErr);
      return { summary: `Reschedule failed: ${updateErr.message}`, display: 'error' };
    }

    if (tour.contactId) {
      const { error: activityErr } = await supabase.from('ContactActivity').insert({
        id: crypto.randomUUID(),
        spaceId: ctx.space.id,
        contactId: tour.contactId,
        type: 'meeting',
        content: `Tour rescheduled to ${args.newStartsAt}${args.why ? `: ${args.why}` : ''}`,
        metadata: { tourId: args.tourId, oldStartsAt: tour.startsAt, newStartsAt: newStarts.toISOString(), via: 'on_demand_agent' },
      });
      if (activityErr) {
        logger.warn('[tools.reschedule_tour] activity insert failed', { tourId: args.tourId }, activityErr);
      }
    }

    const guest = (tour.guestName as string | null) || 'guest';
    return {
      summary: `Tour for ${guest} rescheduled to ${pretty(newStarts.toISOString())}.`,
      data: { tourId: args.tourId, startsAt: newStarts.toISOString(), endsAt: newEnds.toISOString() },
      display: 'success',
    };
  },
});
