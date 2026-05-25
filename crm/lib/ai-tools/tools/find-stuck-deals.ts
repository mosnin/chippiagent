/**
 * `find_stuck_deals` — active deals that haven't been touched in a while.
 *
 * Read-only. Default minDaysQuiet=7. We compare against `updatedAt` since
 * any activity, edit, or stage move bumps that column. Sorted desc by
 * daysQuiet so the loudest one comes first.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';

const parameters = z
  .object({
    minDaysQuiet: z.number().int().min(1).max(180).optional().default(7),
  })
  .describe('Active deals where updatedAt is older than minDaysQuiet days.');

interface StuckDeal {
  id: string;
  title: string;
  value: number | null;
  stageName: string | null;
  daysQuiet: number;
}

interface FindStuckDealsResult {
  deals: StuckDeal[];
}

export const findStuckDealsTool = defineTool<typeof parameters, FindStuckDealsResult>({
  name: 'find_stuck_deals',
  riskLevel: 'safe',
  description: 'Find active deals where updatedAt is older than minDaysQuiet (default 7).',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const minDays = args.minDaysQuiet ?? 7;
    const cutoff = new Date(Date.now() - minDays * 86_400_000).toISOString();

    const { data, error } = await supabase
      .from('Deal')
      .select('id, title, value, stageId, updatedAt')
      .eq('spaceId', ctx.space.id)
      .eq('status', 'active')
      .lt('updatedAt', cutoff)
      .order('updatedAt', { ascending: true })
      .limit(10)
      .abortSignal(ctx.signal);

    if (error) {
      return { summary: `Stuck-deal lookup failed: ${error.message}`, display: 'error' };
    }

    const rows = (data ?? []) as Array<{
      id: string;
      title: string;
      value: number | null;
      stageId: string;
      updatedAt: string;
    }>;
    if (rows.length === 0) {
      return {
        summary: `No deals stuck over ${minDays} days.`,
        data: { deals: [] },
        display: 'deals',
      };
    }

    // Resolve stage names in one shot.
    const stageIds = Array.from(new Set(rows.map((r) => r.stageId)));
    const { data: stages } = await supabase
      .from('DealStage')
      .select('id, name')
      .in('id', stageIds);
    const stageMap = new Map(((stages ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name]));

    const now = Date.now();
    const deals: StuckDeal[] = rows
      .map((r) => ({
        id: r.id,
        title: r.title,
        value: r.value,
        stageName: stageMap.get(r.stageId) ?? null,
        daysQuiet: Math.max(minDays, Math.floor((now - new Date(r.updatedAt).getTime()) / 86_400_000)),
      }))
      .sort((a, b) => b.daysQuiet - a.daysQuiet);

    return {
      summary: `${deals.length} stuck deal${deals.length === 1 ? '' : 's'} over ${minDays} days quiet.`,
      data: { deals },
      display: 'deals',
    };
  },
});
