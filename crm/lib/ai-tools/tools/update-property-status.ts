/**
 * `update_property_status` — flip a Property's listing status.
 *
 * Approval-gated: the listing status drives the property card label and
 * filters across the property index — a wrong flip ("sold" instead of
 * "pending") is visible immediately to the realtor and to anyone with
 * a share link.
 *
 * Allowed statuses come from the DB CHECK constraint on
 * Property.listingStatus (see migration 20260425000000_property.sql):
 *   active | pending | sold | off_market | owned
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const ALLOWED = ['active', 'pending', 'sold', 'off_market', 'owned'] as const;

const parameters = z
  .object({
    propertyId: z.string().min(1).describe('The Property.id to update.'),
    newStatus: z.enum(ALLOWED).describe('New listing status.'),
    why: z.string().max(500).optional(),
  })
  .describe("Update a property's listing status.");

interface UpdatePropertyStatusResult {
  propertyId: string;
  oldStatus: string;
  newStatus: string;
}

export const updatePropertyStatusTool = defineTool<typeof parameters, UpdatePropertyStatusResult>({
  name: 'update_property_status',
  riskLevel: 'low',
  description:
    "Update a property's listing status (active, pending, sold, off_market, owned). Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 60, windowSeconds: 3600 },
  summariseCall(args) {
    const why = args.why ? ` — ${args.why}` : '';
    return `Set property ${args.propertyId.slice(0, 8)} → ${args.newStatus}${why}`;
  },

  async handler(args, ctx) {
    const { data: property, error: fetchErr } = await supabase
      .from('Property')
      .select('id, address, listingStatus')
      .eq('id', args.propertyId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (fetchErr) {
      return { summary: `Property lookup failed: ${fetchErr.message}`, display: 'error' };
    }
    if (!property) {
      return { summary: `No property with id "${args.propertyId}".`, display: 'error' };
    }

    const oldStatus = (property.listingStatus as string) || 'active';
    if (oldStatus === args.newStatus) {
      return {
        summary: `${property.address} is already ${args.newStatus}.`,
        data: { propertyId: property.id, oldStatus, newStatus: args.newStatus },
        display: 'plain',
      };
    }

    const { error: updateErr } = await supabase
      .from('Property')
      .update({ listingStatus: args.newStatus, updatedAt: new Date().toISOString() })
      .eq('id', args.propertyId)
      .eq('spaceId', ctx.space.id);
    if (updateErr) {
      logger.error('[tools.update_property_status] update failed', { propertyId: args.propertyId }, updateErr);
      return { summary: `Update failed: ${updateErr.message}`, display: 'error' };
    }

    return {
      summary: `${property.address} → ${args.newStatus}.`,
      data: { propertyId: property.id, oldStatus, newStatus: args.newStatus },
      display: 'success',
    };
  },
});
