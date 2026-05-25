/**
 * `cancel_tour` — flip a Tour to status='cancelled'.
 *
 * Approval-gated: a cancelled tour drops off the calendar feed and
 * triggers (via cron) the cancel email — worth the realtor confirming.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    tourId: z.string().min(1).describe('The Tour.id to cancel.'),
    reason: z.string().min(1).max(500).describe('Why the tour is being cancelled (logged on the contact activity feed).'),
  })
  .describe('Cancel a tour and log the reason.');

interface CancelTourResult {
  tourId: string;
  status: 'cancelled';
}

export const cancelTourTool = defineTool<typeof parameters, CancelTourResult>({
  name: 'cancel_tour',
  riskLevel: 'destructive',
  description:
    'Cancel a tour. Records the reason on the linked contact. Prompts for approval first.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 60, windowSeconds: 3600 },
  summariseCall(args) {
    return `Cancel tour ${args.tourId.slice(0, 8)} — ${args.reason}`;
  },

  async handler(args, ctx) {
    const { data: tour, error: tourErr } = await supabase
      .from('Tour')
      .select('id, contactId, guestName, propertyAddress, status')
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
      return {
        summary: `That tour is already cancelled.`,
        data: { tourId: args.tourId, status: 'cancelled' as const },
        display: 'plain',
      };
    }

    const { error: updateErr } = await supabase
      .from('Tour')
      .update({ status: 'cancelled', updatedAt: new Date().toISOString() })
      .eq('id', args.tourId)
      .eq('spaceId', ctx.space.id);
    if (updateErr) {
      logger.error('[tools.cancel_tour] update failed', { tourId: args.tourId }, updateErr);
      return { summary: `Cancel failed: ${updateErr.message}`, display: 'error' };
    }

    if (tour.contactId) {
      const { error: activityErr } = await supabase.from('ContactActivity').insert({
        id: crypto.randomUUID(),
        spaceId: ctx.space.id,
        contactId: tour.contactId,
        type: 'note',
        content: `Tour cancelled: ${args.reason}`,
        metadata: { tourId: args.tourId, via: 'on_demand_agent' },
      });
      if (activityErr) {
        logger.warn('[tools.cancel_tour] activity insert failed', { tourId: args.tourId }, activityErr);
      }
    }

    const guest = (tour.guestName as string | null) || 'guest';
    return {
      summary: `Tour for ${guest} cancelled.`,
      data: { tourId: args.tourId, status: 'cancelled' as const },
      display: 'success',
    };
  },
});
