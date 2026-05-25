/**
 * `update_deal_probability` — set Deal.probability (0-100).
 *
 * Approval-gated: probability flows into pipeline-weighted forecasting.
 * The realtor sees the new percentage before we commit.
 *
 * Mirrors the probability-only slice of the Python `update_deal` in
 * `agent/tools/deals.py`. Logs a DealActivity 'note' so the realtor can
 * audit who changed it and why.
 *
 * Schema: Deal.probability INTEGER NULL with CHECK (0..100), added in
 * migration 20260414130000_add_deal_probability.sql. No new migration
 * needed.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    dealId: z.string().min(1).describe('The Deal.id to update.'),
    probability: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe('Close probability as an integer 0-100.'),
    why: z.string().trim().max(500).optional().describe('Short reason for the change.'),
  })
  .describe("Update a deal's close probability.");

interface UpdateDealProbabilityResult {
  dealId: string;
  oldProbability: number | null;
  newProbability: number;
}

export const updateDealProbabilityTool = defineTool<
  typeof parameters,
  UpdateDealProbabilityResult
>({
  name: 'update_deal_probability',
  riskLevel: 'low',
  description:
    "Update a deal's close probability (0-100). Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 60, windowSeconds: 3600 },
  summariseCall(args) {
    const slug =
      typeof args?.dealId === 'string' && args.dealId.length > 0
        ? args.dealId.slice(0, 8)
        : 'deal';
    const pct = typeof args?.probability === 'number' ? args.probability : '?';
    return `Update deal ${slug} probability → ${pct}%`;
  },

  async handler(args, ctx) {
    const { data: deal, error: lookupErr } = await supabase
      .from('Deal')
      .select('id, title, probability')
      .eq('id', args.dealId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (lookupErr) {
      return { summary: `Deal lookup failed: ${lookupErr.message}`, display: 'error' };
    }
    if (!deal) {
      return { summary: `No deal with id "${args.dealId}".`, display: 'error' };
    }

    const oldProbability = (deal.probability as number | null) ?? null;
    if (oldProbability === args.probability) {
      return {
        summary: `"${deal.title}" is already at ${args.probability}%.`,
        data: { dealId: deal.id as string, oldProbability, newProbability: args.probability },
        display: 'plain',
      };
    }

    const { error: updateErr } = await supabase
      .from('Deal')
      .update({ probability: args.probability, updatedAt: new Date().toISOString() })
      .eq('id', args.dealId)
      .eq('spaceId', ctx.space.id);
    if (updateErr) {
      logger.error(
        '[tools.update_deal_probability] update failed',
        { dealId: args.dealId },
        updateErr,
      );
      return { summary: `Update failed: ${updateErr.message}`, display: 'error' };
    }

    const fromStr = oldProbability != null ? `${oldProbability}%` : '—';
    const why = args.why ? `: ${args.why}` : '';
    const { error: activityErr } = await supabase.from('DealActivity').insert({
      id: crypto.randomUUID(),
      dealId: args.dealId,
      spaceId: ctx.space.id,
      type: 'note',
      content: `Probability ${fromStr} → ${args.probability}%${why}`,
      metadata: {
        oldProbability,
        newProbability: args.probability,
        via: 'on_demand_agent',
      },
    });
    if (activityErr) {
      logger.warn(
        '[tools.update_deal_probability] activity insert failed',
        { dealId: args.dealId },
        activityErr,
      );
    }

    return {
      summary: `"${deal.title}" probability set to ${args.probability}%.`,
      data: {
        dealId: args.dealId,
        oldProbability,
        newProbability: args.probability,
      },
      display: 'success',
    };
  },
});
