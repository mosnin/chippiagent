/**
 * `note_on_deal` — append a plain note to a deal's activity log.
 *
 * Plain. The dictation goes in the timeline as written.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    dealId: z.string().min(1).describe('The Deal.id to add the note to.'),
    content: z
      .string()
      .min(1)
      .max(5000)
      .describe('The note text. Stored verbatim.'),
  })
  .describe('Add a plain note to a deal.');

interface NoteOnDealResult {
  dealId: string;
  activityId: string;
}

export const noteOnDealTool = defineTool<typeof parameters, NoteOnDealResult>({
  name: 'note_on_deal',
  riskLevel: 'low',
  description:
    "Add a plain note to a deal's activity log. Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 200, windowSeconds: 3600 },
  summariseCall(args) {
    return `Add note to deal ${args.dealId.slice(0, 8)}`;
  },

  async handler(args, ctx) {
    const { data: deal, error: lookupErr } = await supabase
      .from('Deal')
      .select('id, title')
      .eq('id', args.dealId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (lookupErr) {
      return { summary: `Deal lookup failed: ${lookupErr.message}`, display: 'error' };
    }
    if (!deal) {
      return {
        summary: `No deal with id "${args.dealId}" in this workspace.`,
        display: 'error',
      };
    }

    const activityId = crypto.randomUUID();
    const { error: activityErr } = await supabase.from('DealActivity').insert({
      id: activityId,
      dealId: args.dealId,
      spaceId: ctx.space.id,
      type: 'note',
      content: args.content,
      metadata: { via: 'on_demand_agent' },
    });
    if (activityErr) {
      logger.error(
        '[tools.note_on_deal] insert failed',
        { dealId: args.dealId },
        activityErr,
      );
      return { summary: `Couldn't save the note: ${activityErr.message}`, display: 'error' };
    }

    return {
      summary: `Note added to "${deal.title}".`,
      data: { dealId: args.dealId, activityId },
      display: 'success',
    };
  },
});
