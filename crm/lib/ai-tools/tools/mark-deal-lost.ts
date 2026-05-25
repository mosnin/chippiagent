/**
 * `mark_deal_lost` — close a deal as lost.
 *
 * Approval-gated. Sets status='lost', stores the reason in
 * Deal.wonLostReason, logs a status_change activity, reindexes.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { syncDeal } from '@/lib/vectorize';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    dealId: z.string().min(1).describe('The Deal.id to mark lost.'),
    reason: z
      .string()
      .min(1)
      .max(1000)
      .describe('Why the deal was lost — recorded for post-mortems.'),
  })
  .describe('Mark a deal as lost.');

interface MarkDealLostResult {
  dealId: string;
}

export const markDealLostTool = defineTool<typeof parameters, MarkDealLostResult>({
  name: 'mark_deal_lost',
  riskLevel: 'destructive',
  description:
    "Mark a deal as lost. Reason is required and recorded for post-mortems. Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 60, windowSeconds: 3600 },
  summariseCall(args) {
    return `Mark deal ${args.dealId.slice(0, 8)} lost`;
  },

  async handler(args, ctx) {
    const { data: deal, error: lookupErr } = await supabase
      .from('Deal')
      .select('id, title, status')
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

    const { error: updateErr } = await supabase
      .from('Deal')
      .update({
        status: 'lost',
        wonLostReason: args.reason,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', args.dealId)
      .eq('spaceId', ctx.space.id);
    if (updateErr) {
      logger.error(
        '[tools.mark_deal_lost] update failed',
        { dealId: args.dealId },
        updateErr,
      );
      return { summary: `Update failed: ${updateErr.message}`, display: 'error' };
    }

    const { error: activityErr } = await supabase.from('DealActivity').insert({
      id: crypto.randomUUID(),
      dealId: args.dealId,
      spaceId: ctx.space.id,
      type: 'status_change',
      content: `Lost: ${args.reason}`,
      metadata: { from: deal.status, to: 'lost', via: 'on_demand_agent' },
    });
    if (activityErr) {
      logger.warn(
        '[tools.mark_deal_lost] activity insert failed',
        { dealId: args.dealId },
        activityErr,
      );
    }

    const { data: refreshed } = await supabase
      .from('Deal')
      .select('*')
      .eq('id', args.dealId)
      .maybeSingle();
    if (refreshed) {
      syncDeal(refreshed).catch((err) =>
        logger.warn('[tools.mark_deal_lost] vector sync failed', { dealId: args.dealId }, err),
      );
    }

    return {
      summary: `"${deal.title}" marked lost.`,
      data: { dealId: args.dealId },
      display: 'success',
    };
  },
});
