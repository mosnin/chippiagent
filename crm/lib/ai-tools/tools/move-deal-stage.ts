/**
 * `move_deal_stage` — move a Deal to a new DealStage.
 *
 * Approval-gated: stage moves are high-signal in the pipeline view
 * (the kanban card physically jumps), so the realtor wants a clear
 * "yes that's the move I meant" confirmation.
 *
 * Intentionally narrow in scope. This tool does NOT:
 *   - change the deal's status (active/won/lost)
 *   - reseed the closing checklist — that's an explicit user action
 *   - reassign contacts — unrelated concern
 *
 * What it DOES do, matching PATCH /api/deals/[id]:
 *   - validate the new stageId belongs to this space
 *   - update the row + updatedAt
 *   - log a DealActivity of type 'stage_change' with old→new names
 *   - reindex search via syncDeal
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { syncDeal } from '@/lib/vectorize';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    dealId: z.string().min(1).describe('The Deal.id to move.'),
    stageId: z.string().min(1).describe('The target DealStage.id.'),
  })
  .describe('Move a deal to a different stage in its pipeline.');

interface MoveDealStageResult {
  dealId: string;
  fromStageId: string;
  toStageId: string;
  fromStageName: string;
  toStageName: string;
}

export const moveDealStageTool = defineTool<typeof parameters, MoveDealStageResult>({
  name: 'move_deal_stage',
  riskLevel: 'low',
  description:
    'Move a deal to a different pipeline stage. Prompts for approval first.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 60, windowSeconds: 3600 },
  summariseCall(args) {
    return `Move deal ${args.dealId.slice(0, 8)} → stage ${args.stageId.slice(0, 8)}`;
  },

  async handler(args, ctx) {
    // Deal must exist in this space.
    const { data: deal, error: dealErr } = await supabase
      .from('Deal')
      .select('id, title, stageId, status')
      .eq('id', args.dealId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (dealErr) {
      return { summary: `Deal lookup failed: ${dealErr.message}`, display: 'error' };
    }
    if (!deal) {
      return { summary: `No deal with id "${args.dealId}" in this workspace.`, display: 'error' };
    }
    if (deal.stageId === args.stageId) {
      return {
        summary: `"${deal.title}" is already in that stage.`,
        data: {
          dealId: deal.id,
          fromStageId: deal.stageId,
          toStageId: args.stageId,
          fromStageName: '',
          toStageName: '',
        },
        display: 'plain',
      };
    }

    // Stage must belong to the same space. A stale id from another workspace
    // should never satisfy this check.
    const { data: newStage, error: stageErr } = await supabase
      .from('DealStage')
      .select('id, name')
      .eq('id', args.stageId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (stageErr) {
      return { summary: `Stage lookup failed: ${stageErr.message}`, display: 'error' };
    }
    if (!newStage) {
      return { summary: `Stage "${args.stageId}" not found in this workspace.`, display: 'error' };
    }

    // Fetch the old stage's name for the activity log. Non-fatal if we can't
    // find it — the move still works; we just log "Unknown" as the origin.
    const { data: oldStage } = await supabase
      .from('DealStage')
      .select('name')
      .eq('id', deal.stageId)
      .maybeSingle();

    const { error: updateErr } = await supabase
      .from('Deal')
      .update({ stageId: args.stageId, updatedAt: new Date().toISOString() })
      .eq('id', args.dealId)
      .eq('spaceId', ctx.space.id);
    if (updateErr) {
      logger.error('[tools.move_deal_stage] update failed', { dealId: args.dealId }, updateErr);
      return { summary: `Stage update failed: ${updateErr.message}`, display: 'error' };
    }

    // Activity log — non-fatal. PostgREST returns { error } rather than
    // throwing on RLS/constraint failures, so we check the error field.
    const { error: activityErr } = await supabase.from('DealActivity').insert({
      id: crypto.randomUUID(),
      dealId: args.dealId,
      spaceId: ctx.space.id,
      type: 'stage_change',
      content: `Moved from "${oldStage?.name ?? 'Unknown'}" to "${newStage.name}"`,
      metadata: { fromStageId: deal.stageId, toStageId: args.stageId, via: 'on_demand_agent' },
    });
    if (activityErr) {
      logger.warn(
        '[tools.move_deal_stage] activity insert failed',
        { dealId: args.dealId },
        activityErr,
      );
    }

    // Search reindex — best effort. We load the minimum the indexer needs.
    const { data: refreshed } = await supabase
      .from('Deal')
      .select('*')
      .eq('id', args.dealId)
      .maybeSingle();
    if (refreshed) {
      syncDeal({ ...refreshed, stage: { name: newStage.name } }).catch((err) =>
        logger.warn('[tools.move_deal_stage] vector sync failed', { dealId: args.dealId }, err),
      );
    }

    return {
      summary: `Moved "${deal.title}" → "${newStage.name}".`,
      data: {
        dealId: args.dealId,
        fromStageId: deal.stageId,
        toStageId: args.stageId,
        fromStageName: oldStage?.name ?? '',
        toStageName: newStage.name,
      },
      display: 'success',
    };
  },
});
