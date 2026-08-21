/**
 * `move_deal_stage` — move a Deal to a new DealStage.
 *
 * Autonomous: stage moves fire `deal_stage_changed` and send now. No
 * approval queue, no pending draft.
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
 *   - fire deal_stage_changed and send without a human queue
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { syncDeal } from '@/lib/vectorize';
import { logger } from '@/lib/logger';
import { fireAgentTrigger } from '@/lib/agent/fire-trigger';
import { firstNameOf } from '@/lib/agent/first-touch';
import { sendSMS } from '@/lib/sms';
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
    'Move a deal to a different pipeline stage. Fires deal_stage_changed and sends without waiting for approval.',
  parameters,
  requiresApproval: false,
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

    await fireAndSendDealStageChanged({
      spaceId: ctx.space.id,
      dealId: args.dealId,
      stageName: newStage.name,
    });

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

export function composeDealStageChangedSms(
  contactName: string,
  stageName: string,
  agentFirstName: string,
): string {
  const lead = firstNameOf(contactName, 'there');
  const who = firstNameOf(agentFirstName, 'I') || 'I';
  const stage = stageName.trim() || 'the next stage';
  const content = `Hey ${lead}, this is ${who}. Now in ${stage}. Want to talk next steps?`
    .replace(/\s+/g, ' ')
    .trim();
  if (/\bchippy\b/i.test(content)) {
    throw new Error('deal-stage SMS used the wrong brand spelling');
  }
  return content;
}

/** Fire deal_stage_changed and send now. Never inserts a pending draft. */
export async function fireAndSendDealStageChanged(input: {
  spaceId: string;
  dealId: string;
  stageName: string;
  contactId?: string;
}): Promise<void> {
  try {
    await fireAgentTrigger({
      spaceId: input.spaceId,
      event: 'deal_stage_changed',
      dealId: input.dealId,
      contactId: input.contactId,
    });
  } catch (e) {
    logger.error('[tools.move_deal_stage] agent trigger failed', { dealId: input.dealId }, e);
  }

  try {
    await sendDealStageChangedSmsNow(input);
  } catch (e) {
    logger.error('[tools.move_deal_stage] stage-change send failed', { dealId: input.dealId }, e);
  }
}

async function sendDealStageChangedSmsNow(input: {
  spaceId: string;
  dealId: string;
  stageName: string;
}): Promise<void> {
  const { data: links } = await supabase
    .from('DealContact')
    .select('contactId')
    .eq('dealId', input.dealId);
  const contactIds = [...new Set((links ?? []).map((row: { contactId: string }) => row.contactId).filter(Boolean))];
  if (contactIds.length === 0) return;

  const { data: contacts } = await supabase
    .from('Contact')
    .select('id, name, phone')
    .in('id', contactIds)
    .eq('spaceId', input.spaceId);

  const { data: profile } = await supabase
    .from('AIUserProfile')
    .select('displayName')
    .eq('spaceId', input.spaceId)
    .maybeSingle();
  const agentFirstName = firstNameOf(profile?.displayName, 'I') || 'I';

  for (const contact of contacts ?? []) {
    const phone = (contact.phone as string | null | undefined)?.trim();
    if (!phone) continue;
    const body = composeDealStageChangedSms(
      (contact.name as string | null | undefined) ?? 'there',
      input.stageName,
      agentFirstName,
    );
    const sent = await sendSMS({ to: phone, body });
    if (!sent) continue;
    const { error } = await supabase.from('ContactActivity').insert({
      id: crypto.randomUUID(),
      contactId: contact.id,
      spaceId: input.spaceId,
      type: 'note',
      content: `SMS: ${body.slice(0, 140)}${body.length > 140 ? '…' : ''}`,
      metadata: { channel: 'sms', via: 'trigger_send', event: 'deal_stage_changed', dealId: input.dealId },
    });
    if (error) {
      logger.warn('[tools.move_deal_stage] send activity insert failed', { contactId: contact.id }, error);
    }
  }
}
