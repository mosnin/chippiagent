/**
 * `find_tours` — read-only lookup over the Tour table.
 *
 * Four filters cover 95% of the realtor's questions:
 *   - "what tours does Jane have on the books?"   → personId
 *   - "what tours are scheduled for that listing?" → propertyId
 *   - "what's on the calendar this week?"          → fromDate/toDate
 *   - "any cancelled tours I should know about?"   → status
 *
 * Anything beyond that is gold-plating; cut.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';

const parameters = z
  .object({
    personId: z.string().min(1).optional().describe('Contact.id to filter by.'),
    propertyId: z.string().min(1).optional().describe('Property.id to filter by.'),
    fromDate: z.string().datetime().optional().describe('ISO start of the window (inclusive).'),
    toDate: z.string().datetime().optional().describe('ISO end of the window (inclusive).'),
    status: z
      .enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'])
      .optional()
      .describe('Limit to a single status.'),
  })
  .describe('Find tours by person, property, date window, or status.');

interface TourRow {
  id: string;
  startsAt: string;
  endsAt: string;
  propertyAddress: string | null;
  guestName: string;
  status: string;
}

interface FindToursResult {
  tours: TourRow[];
}

export const findToursTool = defineTool<typeof parameters, FindToursResult>({
  name: 'find_tours',
  riskLevel: 'safe',
  description:
    "List tours filtered by person, property, date range, or status. Up to 20, sorted by start time.",
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    let query = supabase
      .from('Tour')
      .select('id, startsAt, endsAt, propertyAddress, guestName, status')
      .eq('spaceId', ctx.space.id)
      .order('startsAt', { ascending: true })
      .limit(20);

    if (args.personId) query = query.eq('contactId', args.personId);
    if (args.propertyId) query = query.eq('propertyId', args.propertyId);
    if (args.status) query = query.eq('status', args.status);
    if (args.fromDate) query = query.gte('startsAt', args.fromDate);
    if (args.toDate) query = query.lte('startsAt', args.toDate);

    const { data, error } = await query.abortSignal(ctx.signal);
    if (error) {
      return { summary: `Tour lookup failed: ${error.message}`, display: 'error' };
    }

    const tours = (data ?? []) as TourRow[];
    if (tours.length === 0) {
      return {
        summary: 'No tours matched.',
        data: { tours: [] },
        display: 'tours',
      };
    }

    const lines = tours.slice(0, 5).map((t) => {
      const when = new Date(t.startsAt).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      const where = t.propertyAddress ? ` at ${t.propertyAddress}` : '';
      return `• ${when} — ${t.guestName}${where} (${t.status})`;
    });
    const more = tours.length > 5 ? `\n…and ${tours.length - 5} more.` : '';

    return {
      summary: `${tours.length} tour${tours.length === 1 ? '' : 's'}:\n${lines.join('\n')}${more}`,
      data: { tours },
      display: 'tours',
    };
  },
});
