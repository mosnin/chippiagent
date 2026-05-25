/**
 * `mark_deal_won` — close a deal as won.
 *
 * Approval-gated: this is the moment the brokerage's commission ledger
 * gets a row. The realtor signs off.
 *
 * Sets Deal.status='won', writes wonLostNote (the audit trail of why this
 * was a win), optionally updates Deal.value with the final sale price, logs
 * a status_change activity, and reindexes search.
 *
 * Note: the schema has no `wonAt` column — Deal.updatedAt + the activity
 * row's createdAt are the time-of-close trail.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { syncDeal } from '@/lib/vectorize';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    dealId: z.string().min(1).describe('The Deal.id to mark won.'),
    finalValue: z
      .number()
      .nonnegative()
      .optional()
      .describe('Final sale price. If provided, overwrites Deal.value.'),
    note: z
      .string()
      .max(1000)
      .optional()
      .describe('Closing note — written to Deal.wonLostNote.'),
  })
  .describe('Mark a deal as won.');

interface MarkDealWonResult {
  dealId: string;
  finalValue: number | null;
}

export const markDealWonTool = defineTool<typeof parameters, MarkDealWonResult>({
  name: 'mark_deal_won',
  riskLevel: 'low',
  description:
    "Mark a deal as won. Optionally records the final sale price and a closing note. Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 60, windowSeconds: 3600 },
  summariseCall(args) {
    const v = args.finalValue != null ? ` at $${args.finalValue.toLocaleString()}` : '';
    return `Mark deal ${args.dealId.slice(0, 8)} won${v}`;
  },

  async handler(args, ctx) {
    const { data: deal, error: lookupErr } = await supabase
      .from('Deal')
      .select('id, title, status, value')
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

    const updates: Record<string, unknown> = {
      status: 'won',
      updatedAt: new Date().toISOString(),
    };
    if (args.finalValue !== undefined) updates.value = args.finalValue;
    if (args.note !== undefined) updates.wonLostNote = args.note;

    const { error: updateErr } = await supabase
      .from('Deal')
      .update(updates)
      .eq('id', args.dealId)
      .eq('spaceId', ctx.space.id);
    if (updateErr) {
      logger.error(
        '[tools.mark_deal_won] update failed',
        { dealId: args.dealId },
        updateErr,
      );
      return { summary: `Update failed: ${updateErr.message}`, display: 'error' };
    }

    const recordedValue = args.finalValue ?? deal.value;
    const valueLabel = recordedValue != null ? `$${Number(recordedValue).toLocaleString()}` : 'unspecified';

    const { error: activityErr } = await supabase.from('DealActivity').insert({
      id: crypto.randomUUID(),
      dealId: args.dealId,
      spaceId: ctx.space.id,
      type: 'status_change',
      content: `Won at ${valueLabel}`,
      metadata: {
        from: deal.status,
        to: 'won',
        finalValue: args.finalValue ?? null,
        via: 'on_demand_agent',
      },
    });
    if (activityErr) {
      logger.warn(
        '[tools.mark_deal_won] activity insert failed',
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
        logger.warn('[tools.mark_deal_won] vector sync failed', { dealId: args.dealId }, err),
      );
    }

    return {
      summary: `"${deal.title}" marked won at ${valueLabel}.`,
      data: { dealId: args.dealId, finalValue: args.finalValue ?? null },
      display: 'success',
    };
  },
});
