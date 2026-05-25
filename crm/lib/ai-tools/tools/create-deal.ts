/**
 * `create_deal` — spin up a new Deal in a specific pipeline stage.
 *
 * Approval-gated. Creating a deal is a meaningful pipeline event — it
 * lands on the kanban, hits commission reporting, and fires a new-deal
 * notification — so the user confirms the title / stage / linked
 * contacts before we write.
 *
 * Mirrors POST /api/deals but intentionally narrower:
 *   - no milestones / commissionRate / probability (the realtor can set
 *     these in the deal detail view after creation)
 *   - no custom position (new deals land at the bottom of the stage,
 *     matching the kanban default)
 *   - doesn't seed a closing checklist (same explicit-action rationale
 *     as add_checklist_item's single-item-only scope)
 *
 * The server-side new-deal notification (email + SMS to the space owner)
 * DOES fire because we route through the same notifyNewDeal helper —
 * no silent creations.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { syncDeal } from '@/lib/vectorize';
import { notifyNewDeal } from '@/lib/notify';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';
import type { Deal, DealStage } from '@/lib/types';
import { makeIdempotencyKey, withIdempotency } from '@/lib/agent/ts-idempotency';

const parameters = z
  .object({
    title: z.string().min(1).max(255).describe('Short label shown on the kanban card.'),
    stageId: z
      .string()
      .min(1)
      .nullable()
      .optional()
      .describe(
        'Target DealStage.id. Optional — if omitted or null the deal lands in the first stage of the appropriate pipeline (buyer pipeline when a buyer contact is attached, otherwise the seller pipeline). Only set this when the realtor explicitly named the stage.',
      ),
    description: z.string().max(5000).optional(),
    value: z.number().nonnegative().nullable().optional().describe('Deal value in dollars.'),
    address: z.string().max(500).optional().describe('Property address, if relevant.'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
    closeDate: z.string().datetime().nullable().optional(),
    contactIds: z
      .array(z.string().min(1))
      .max(10)
      .optional()
      .describe('Contacts to link to this deal (buyers, sellers, co-agents).'),
  })
  .describe(
    'Create a new deal. Stage is optional — leave it blank and we land it in the first stage of the right pipeline. Prompts for approval first.',
  );

interface CreateDealResult {
  dealId: string;
  title: string;
  stageId: string;
  stageName: string;
  linkedContactIds: string[];
}

export const createDealTool = defineTool<typeof parameters, CreateDealResult>({
  name: 'create_deal',
  riskLevel: 'low',
  description:
    'Create a new deal in a pipeline stage, optionally linking people. Prompts for approval first.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 30, windowSeconds: 3600 },
  summariseCall(args) {
    const value =
      typeof args.value === 'number' ? ` @ $${args.value.toLocaleString('en-US')}` : '';
    const contacts = args.contactIds?.length ? ` with ${args.contactIds.length} contact(s)` : '';
    return `Create deal "${args.title}"${value}${contacts}`;
  },

  async handler(args, ctx) {
    // Validate every contactId belongs to this space. Mirror the PATCH
    // route's silent-filter behavior: drop unknown ids rather than 400.
    // Hoisted above the stage resolution because the contacts' leadType
    // determines which pipeline a defaulted stage falls into.
    let validContactIds: string[] = [];
    let buyerAmongContacts = false;
    if (args.contactIds && args.contactIds.length > 0) {
      const { data: validContacts, error: vcErr } = await supabase
        .from('Contact')
        .select('id, leadType')
        .in('id', args.contactIds)
        .eq('spaceId', ctx.space.id)
        .is('brokerageId', null);
      if (vcErr) {
        return { summary: `Contact validation failed: ${vcErr.message}`, display: 'error' };
      }
      const validRows = validContacts ?? [];
      const validSet = new Set(validRows.map((c: { id: string }) => c.id));
      validContactIds = args.contactIds.filter((id) => validSet.has(id));
      buyerAmongContacts = validRows.some(
        (c: { leadType: string | null }) => c.leadType === 'buyer',
      );
    }

    // Stage resolution. If the model passed a real stageId, validate and
    // use it (with the existing buyer-pipeline auto-route below). If it
    // was omitted or null, default to the first stage of the appropriate
    // pipeline so the realtor doesn't have to know stage ids.
    type StageRow = { id: string; name: string; pipelineType: string | null };
    let stage: StageRow | null = null;
    if (args.stageId) {
      const { data: row, error: stageErr } = await supabase
        .from('DealStage')
        .select('id, name, pipelineType')
        .eq('id', args.stageId)
        .eq('spaceId', ctx.space.id)
        .maybeSingle();
      if (stageErr) {
        return { summary: `Stage lookup failed: ${stageErr.message}`, display: 'error' };
      }
      stage = (row ?? null) as StageRow | null;
    }

    if (!stage) {
      const preferredPipeline = buyerAmongContacts ? 'buyer' : 'seller';
      const { data: defaults } = await supabase
        .from('DealStage')
        .select('id, name, pipelineType')
        .eq('spaceId', ctx.space.id)
        .eq('pipelineType', preferredPipeline)
        .order('position', { ascending: true })
        .limit(1);
      const defaultRows = (defaults ?? []) as StageRow[];
      if (defaultRows.length > 0) {
        stage = defaultRows[0];
      } else {
        // Workspace has no buyer/seller pipeline configured — fall back
        // to whatever stage exists at position 0.
        const { data: anyStage } = await supabase
          .from('DealStage')
          .select('id, name, pipelineType')
          .eq('spaceId', ctx.space.id)
          .order('position', { ascending: true })
          .limit(1);
        const anyRows = (anyStage ?? []) as StageRow[];
        if (anyRows.length > 0) {
          stage = anyRows[0];
        }
      }
    }

    if (!stage) {
      return {
        summary: 'No pipeline stages configured in this workspace yet — set one up before creating deals.',
        display: 'error',
      };
    }

    // Auto-route buyer deals to the buyer pipeline's first stage — mirrors
    // POST /api/deals. A realtor who says "create a deal for Jane (a buyer)"
    // in the seller pipeline should land the deal where buyer workflows
    // actually live, not in a mismatched stage that will confuse the kanban.
    let finalStageId = stage.id;
    let finalStage: StageRow = stage;
    if (buyerAmongContacts && stage.pipelineType !== 'buyer') {
      const { data: buyerStages } = await supabase
        .from('DealStage')
        .select('id, name, pipelineType')
        .eq('spaceId', ctx.space.id)
        .eq('pipelineType', 'buyer')
        .order('position', { ascending: true })
        .limit(1);
      const buyerRows = (buyerStages ?? []) as StageRow[];
      if (buyerRows.length > 0) {
        finalStageId = buyerRows[0].id;
        finalStage = buyerRows[0];
      }
    }

    // Position = bottom of the stage's current column.
    const { data: lastDealRow } = await supabase
      .from('Deal')
      .select('position')
      .eq('stageId', finalStageId)
      .eq('spaceId', ctx.space.id)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPosition = (lastDealRow?.position ?? -1) + 1;

    const dealId = crypto.randomUUID();
    const idemKey = makeIdempotencyKey(
      'create_deal',
      ctx.space.id,
      args.title.trim(),
      finalStageId,
      String(args.value ?? ''),
    );
    const { data: dealRow, error: dealErr } = await withIdempotency(idemKey, async () =>
      supabase
        .from('Deal')
        .insert({
          id: dealId,
          spaceId: ctx.space.id,
          title: args.title.trim().slice(0, 255),
          description: args.description?.trim() || null,
          value: args.value ?? null,
          address: args.address?.trim() || null,
          priority: args.priority ?? 'MEDIUM',
          closeDate: args.closeDate ? new Date(args.closeDate).toISOString() : null,
          stageId: finalStageId,
          position: nextPosition,
        })
        .select()
        .single(),
    );
    if (dealErr || !dealRow) {
      logger.error('[tools.create_deal] insert failed', { spaceId: ctx.space.id }, dealErr);
      return {
        summary: `Failed to create deal: ${dealErr?.message ?? 'unknown error'}`,
        display: 'error',
      };
    }

    // Link contacts. Any DB failure here leaves the deal row in place —
    // same trade-off as the HTTP route, which logs + 500s. We log + surface
    // a partial success.
    if (validContactIds.length > 0) {
      const { error: dcErr } = await supabase
        .from('DealContact')
        .insert(validContactIds.map((cId) => ({ dealId, contactId: cId })));
      if (dcErr) {
        logger.warn(
          '[tools.create_deal] contact linking failed',
          { dealId, count: validContactIds.length },
          dcErr,
        );
      }
    }

    // Search reindex + new-deal notification — best-effort, matches the
    // HTTP route's fire-and-forget pattern.
    syncDeal({ ...(dealRow as Deal), stage: finalStage as DealStage } as Deal & {
      stage: { name: string };
    }).catch((err) => logger.warn('[tools.create_deal] vector sync failed', { dealId }, err));

    try {
      await notifyNewDeal({
        spaceId: ctx.space.id,
        dealTitle: args.title,
        dealValue: args.value ?? null,
        dealAddress: args.address ?? null,
        dealPriority: args.priority ?? null,
      });
    } catch (err) {
      logger.warn('[tools.create_deal] notification failed', { dealId }, err);
    }

    const reroutedNote =
      args.stageId && finalStageId !== args.stageId
        ? ` (auto-routed to the buyer pipeline because a buyer contact is attached)`
        : '';

    return {
      summary: `Created deal "${args.title}" in stage "${finalStage.name}"${
        validContactIds.length ? ` with ${validContactIds.length} contact(s) linked` : ''
      }${reroutedNote}.`,
      data: {
        dealId,
        title: args.title,
        stageId: finalStageId,
        stageName: finalStage.name,
        linkedContactIds: validContactIds,
      },
      display: 'success',
    };
  },
});
