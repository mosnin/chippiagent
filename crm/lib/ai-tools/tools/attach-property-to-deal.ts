/**
 * `attach_property_to_deal` — link an existing Property row to a Deal.
 *
 * Approval-gated: this is the kind of edit that quietly changes which
 * listing the deal is "about" — worth a single confirm tap.
 *
 * Both rows must belong to the caller's space (no cross-workspace links).
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { syncDeal } from '@/lib/vectorize';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    dealId: z.string().min(1).describe('The Deal.id to attach a property to.'),
    propertyId: z.string().min(1).describe('The Property.id to link.'),
  })
  .describe('Link a property to a deal so the deal card carries the listing.');

interface AttachPropertyResult {
  dealId: string;
  propertyId: string;
  address: string;
}

export const attachPropertyToDealTool = defineTool<typeof parameters, AttachPropertyResult>({
  name: 'attach_property_to_deal',
  riskLevel: 'low',
  description:
    'Link an existing property to a deal. Prompts for approval first.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 60, windowSeconds: 3600 },
  summariseCall(args) {
    return `Link property ${args.propertyId.slice(0, 8)} → deal ${args.dealId.slice(0, 8)}`;
  },

  async handler(args, ctx) {
    const { data: deal, error: dealErr } = await supabase
      .from('Deal')
      .select('id, title, propertyId')
      .eq('id', args.dealId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (dealErr) {
      return { summary: `Deal lookup failed: ${dealErr.message}`, display: 'error' };
    }
    if (!deal) {
      return { summary: `No deal with id "${args.dealId}".`, display: 'error' };
    }

    const { data: property, error: propErr } = await supabase
      .from('Property')
      .select('id, address')
      .eq('id', args.propertyId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (propErr) {
      return { summary: `Property lookup failed: ${propErr.message}`, display: 'error' };
    }
    if (!property) {
      return { summary: `No property with id "${args.propertyId}" in this workspace.`, display: 'error' };
    }

    if (deal.propertyId === property.id) {
      return {
        summary: `"${deal.title}" is already linked to ${property.address}.`,
        data: { dealId: deal.id, propertyId: property.id, address: property.address },
        display: 'plain',
      };
    }

    const { error: updateErr } = await supabase
      .from('Deal')
      .update({ propertyId: property.id, updatedAt: new Date().toISOString() })
      .eq('id', args.dealId)
      .eq('spaceId', ctx.space.id);
    if (updateErr) {
      logger.error('[tools.attach_property_to_deal] update failed', { dealId: args.dealId }, updateErr);
      return { summary: `Link failed: ${updateErr.message}`, display: 'error' };
    }

    const { error: activityErr } = await supabase.from('DealActivity').insert({
      id: crypto.randomUUID(),
      dealId: args.dealId,
      spaceId: ctx.space.id,
      type: 'note',
      content: `Linked to property ${property.address}`,
      metadata: { propertyId: property.id, via: 'on_demand_agent' },
    });
    if (activityErr) {
      logger.warn('[tools.attach_property_to_deal] activity insert failed', { dealId: args.dealId }, activityErr);
    }

    const { data: refreshed } = await supabase
      .from('Deal')
      .select('*')
      .eq('id', args.dealId)
      .maybeSingle();
    if (refreshed) {
      syncDeal(refreshed).catch((err) =>
        logger.warn('[tools.attach_property_to_deal] vector sync failed', { dealId: args.dealId }, err),
      );
    }

    return {
      summary: `Linked "${deal.title}" → ${property.address}.`,
      data: { dealId: args.dealId, propertyId: property.id, address: property.address },
      display: 'success',
    };
  },
});
