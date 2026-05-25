/**
 * `find_comparable_properties` — search local Property rows in this workspace.
 *
 * Read-only. Honest about scope: this is NOT MLS. It searches Property rows
 * the realtor has saved (their own listings, off-market notes, owned). If
 * MLS lookup is needed, that's a separate integration that doesn't exist yet.
 *
 * Sort: when a price midpoint is computable from priceMin + priceMax (or one
 * of them), rank by ABS(price - midpoint). Otherwise default to recently
 * updated.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';

const parameters = z
  .object({
    near: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe('Free-text address or city/region to ILIKE-match.'),
    beds: z.number().int().min(0).max(20).optional(),
    baths: z.number().min(0).max(20).optional(),
    priceMin: z.number().min(0).optional(),
    priceMax: z.number().min(0).optional(),
    status: z
      .enum(['active', 'pending', 'sold', 'off_market', 'owned'])
      .optional()
      .describe("Property.listingStatus filter."),
  })
  .describe('Find up to 6 saved properties matching the criteria. Local CRM only — no MLS.');

interface PropertyMatch {
  id: string;
  address: string;
  city: string | null;
  beds: number | null;
  baths: number | null;
  listPrice: number | null;
  listingStatus: string;
}

interface FindCompsResult {
  properties: PropertyMatch[];
  note?: string;
}

export const findComparablePropertiesTool = defineTool<typeof parameters, FindCompsResult>({
  name: 'find_comparable_properties',
  riskLevel: 'safe',
  description:
    'Search saved Property rows in this workspace by location, beds/baths, price range, status. Returns up to 6. Does NOT query MLS.',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    let query = supabase
      .from('Property')
      .select('id, address, city, beds, baths, listPrice, listingStatus, updatedAt')
      .eq('spaceId', ctx.space.id)
      .limit(20); // small over-fetch to allow midpoint sort

    if (args.beds != null) query = query.gte('beds', args.beds);
    if (args.baths != null) query = query.gte('baths', args.baths);
    if (args.priceMin != null) query = query.gte('listPrice', args.priceMin);
    if (args.priceMax != null) query = query.lte('listPrice', args.priceMax);
    if (args.status) query = query.eq('listingStatus', args.status);
    if (args.near) {
      const escaped = args.near.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/[,()]/g, '');
      const pat = `%${escaped}%`;
      query = query.or(`address.ilike.${pat},city.ilike.${pat},stateRegion.ilike.${pat}`);
    }
    query = query.order('updatedAt', { ascending: false });

    const { data, error } = await query.abortSignal(ctx.signal);
    if (error) {
      return { summary: `Property lookup failed: ${error.message}`, display: 'error' };
    }

    let rows = (data ?? []) as Array<PropertyMatch & { updatedAt: string }>;
    if (rows.length === 0) {
      return {
        summary: 'No comparable properties on file.',
        data: { properties: [], note: 'No comparable properties on file.' },
        display: 'plain',
      };
    }

    // Midpoint sort when we have a usable price band.
    const midpoint =
      args.priceMin != null && args.priceMax != null
        ? (args.priceMin + args.priceMax) / 2
        : args.priceMin ?? args.priceMax ?? null;
    if (midpoint != null) {
      rows = rows
        .filter((r) => r.listPrice != null)
        .sort((a, b) => Math.abs((a.listPrice ?? 0) - midpoint) - Math.abs((b.listPrice ?? 0) - midpoint));
    }
    rows = rows.slice(0, 6);

    const properties: PropertyMatch[] = rows.map((r) => ({
      id: r.id,
      address: r.address,
      city: r.city,
      beds: r.beds,
      baths: r.baths,
      listPrice: r.listPrice,
      listingStatus: r.listingStatus,
    }));

    return {
      summary: `${properties.length} comparable propert${properties.length === 1 ? 'y' : 'ies'} on file.`,
      data: { properties },
      display: 'plain',
    };
  },
});
