/**
 * `update_deal_value` — change a Deal's monetary value.
 *
 * Approval-gated: the value drives commission math and pipeline reports,
 * so the realtor sees the new number before we commit. The model can pass
 * an optional `why` to capture the reasoning in the activity log.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { syncDeal } from '@/lib/vectorize';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    dealId: z.string().min(1).describe('The Deal.id to update.'),
    newValue: z
      .number()
      .nonnegative()
      .max(1_000_000_000)
      .describe('The new deal value in dollars (no currency symbols).'),
    why: z.string().max(500).optional().describe('Short reason for the change.'),
  })
  .describe('Change a deal\'s value (price/commission base).');

interface UpdateDealValueResult {
  dealId: string;
  oldValue: number | null;
  newValue: number;
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export const updateDealValueTool = defineTool<typeof parameters, UpdateDealValueResult>({
  name: 'update_deal_value',
  riskLevel: 'low',
  description:
    "Update a deal's monetary value. Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 60, windowSeconds: 3600 },
  summariseCall(args) {
    const why = args.why ? ` — ${args.why}` : '';
    return `Set deal ${args.dealId.slice(0, 8)} value → ${fmt(args.newValue)}${why}`;
  },

  async handler(args, ctx) {
    const { data: deal, error: dealErr } = await supabase
      .from('Deal')
      .select('id, title, value')
      .eq('id', args.dealId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (dealErr) {
      return { summary: `Deal lookup failed: ${dealErr.message}`, display: 'error' };
    }
    if (!deal) {
      return { summary: `No deal with id "${args.dealId}".`, display: 'error' };
    }

    const oldValue = (deal.value as number | null) ?? null;
    if (oldValue !== null && Math.abs(oldValue - args.newValue) < 0.01) {
      return {
        summary: `"${deal.title}" is already at ${fmt(args.newValue)}.`,
        data: { dealId: deal.id, oldValue, newValue: args.newValue },
        display: 'plain',
      };
    }

    const { error: updateErr } = await supabase
      .from('Deal')
      .update({ value: args.newValue, updatedAt: new Date().toISOString() })
      .eq('id', args.dealId)
      .eq('spaceId', ctx.space.id);
    if (updateErr) {
      logger.error('[tools.update_deal_value] update failed', { dealId: args.dealId }, updateErr);
      return { summary: `Update failed: ${updateErr.message}`, display: 'error' };
    }

    const why = args.why ? `: ${args.why}` : '';
    const { error: activityErr } = await supabase.from('DealActivity').insert({
      id: crypto.randomUUID(),
      dealId: args.dealId,
      spaceId: ctx.space.id,
      type: 'note',
      content: `Value updated to ${fmt(args.newValue)}${why}`,
      metadata: { oldValue, newValue: args.newValue, via: 'on_demand_agent' },
    });
    if (activityErr) {
      logger.warn('[tools.update_deal_value] activity insert failed', { dealId: args.dealId }, activityErr);
    }

    const { data: refreshed } = await supabase
      .from('Deal')
      .select('*')
      .eq('id', args.dealId)
      .maybeSingle();
    if (refreshed) {
      syncDeal(refreshed).catch((err) =>
        logger.warn('[tools.update_deal_value] vector sync failed', { dealId: args.dealId }, err),
      );
    }

    return {
      summary: `"${deal.title}" value set to ${fmt(args.newValue)}.`,
      data: { dealId: args.dealId, oldValue, newValue: args.newValue },
      display: 'success',
    };
  },
});
