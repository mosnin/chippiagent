/**
 * `block_time` — drop a "Blocked" entry on the calendar.
 *
 * Approval-gated: anything that lands on the calendar gets the same prompt
 * as schedule_tour.
 *
 * CalendarEvent's schema is (date, time) not (startsAt, endsAt). We split
 * the requested ISO range to date + HH:MM. Multi-day blocks land as a single
 * row keyed to the start date — that mirrors the existing manual UI; if the
 * realtor needs a multi-day block they create one per day. Honest with the
 * model: returns the persisted shape so it knows what landed.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    from: z.string().datetime().describe('ISO start of the block.'),
    to: z.string().datetime().describe('ISO end of the block.'),
    reason: z.string().trim().min(1).max(120).describe('Why — surfaces in the title.'),
  })
  .refine((v) => new Date(v.to) > new Date(v.from), {
    message: '`to` must be after `from`.',
  })
  .describe('Block a window on the realtor\'s calendar.');

interface BlockTimeResult {
  eventId: string;
  date: string;
  time: string | null;
  title: string;
}

export const blockTimeTool = defineTool<typeof parameters, BlockTimeResult>({
  name: 'block_time',
  riskLevel: 'high',
  description:
    'Block a window on the realtor\'s calendar with a CalendarEvent. Prompts for approval.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 60, windowSeconds: 3600 },
  summariseCall(args) {
    const fromTxt = new Date(args.from).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    const toTxt = new Date(args.to).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    return `Block calendar ${fromTxt} → ${toTxt} — ${args.reason}`;
  },

  async handler(args, ctx) {
    const start = new Date(args.from);
    const date = start.toISOString().slice(0, 10);
    const time = start.toISOString().slice(11, 16); // HH:MM
    const title = `Blocked: ${args.reason.trim()}`;
    const description = `Through ${new Date(args.to).toISOString()}`;

    const { data: inserted, error } = await supabase
      .from('CalendarEvent')
      .insert({
        spaceId: ctx.space.id,
        title,
        date,
        time,
        description,
        color: 'gray',
      })
      .select('id, date, time, title')
      .single();

    if (error || !inserted) {
      logger.error('[tools.block_time] insert failed', { spaceId: ctx.space.id }, error);
      return { summary: `Failed to block time: ${error?.message ?? 'unknown error'}`, display: 'error' };
    }

    const row = inserted as { id: string; date: string; time: string | null; title: string };
    return {
      summary: `Blocked ${row.date}${row.time ? ` at ${row.time}` : ''} — ${args.reason.trim()}.`,
      data: { eventId: row.id, date: row.date, time: row.time, title: row.title },
      display: 'success',
    };
  },
});
