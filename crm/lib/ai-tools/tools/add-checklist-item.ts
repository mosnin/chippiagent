/**
 * `add_checklist_item` — append one item to a deal's closing checklist.
 *
 * Approval-gated. Adding a checklist item is genuinely low-stakes (it's
 * a task the realtor can delete), but it's still a visible mutation that
 * shows up on the pipeline card, so we prompt so the user sees the
 * kind + label + due date before we write.
 *
 * Seeding the full template checklist is a larger, irreversible-looking
 * operation and intentionally out of scope for this tool — the realtor
 * already has a "Seed from template" button in the UI.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const CHECKLIST_KINDS = [
  'earnest_money',
  'inspection',
  'appraisal',
  'loan_commitment',
  'clear_to_close',
  'final_walkthrough',
  'closing',
  'custom',
] as const;

const parameters = z
  .object({
    dealId: z.string().min(1).describe('The Deal.id to add to.'),
    kind: z
      .enum(CHECKLIST_KINDS)
      .default('custom')
      .describe('Checklist category. Use "custom" for anything outside the preset list.'),
    label: z.string().min(1).max(200).describe('One-line description of the task.'),
    dueAt: z
      .string()
      .datetime()
      .nullable()
      .optional()
      .describe('Optional due date (ISO). Leave unset if open-ended.'),
  })
  .describe('Add a single item to a deal\'s closing checklist.');

interface AddChecklistItemResult {
  itemId: string;
  dealId: string;
  kind: string;
  label: string;
  dueAt: string | null;
}

export const addChecklistItemTool = defineTool<typeof parameters, AddChecklistItemResult>({
  name: 'add_checklist_item',
  riskLevel: 'low',
  description:
    "Add a single task to a deal's closing checklist (earnest money, inspection, appraisal, etc.). Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 60, windowSeconds: 3600 },
  summariseCall(args) {
    const due = args.dueAt
      ? ` (due ${new Date(args.dueAt).toISOString().slice(0, 10)})`
      : '';
    return `Add checklist item "${args.label}" to deal ${args.dealId.slice(0, 8)}${due}`;
  },

  async handler(args, ctx) {
    // Deal must exist in this space — we don't take the FK's word for it
    // because an out-of-space dealId would still satisfy the FK.
    const { data: deal, error: dealErr } = await supabase
      .from('Deal')
      .select('id, title')
      .eq('id', args.dealId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (dealErr) {
      return { summary: `Deal lookup failed: ${dealErr.message}`, display: 'error' };
    }
    if (!deal) {
      return { summary: `No deal with id "${args.dealId}" in this workspace.`, display: 'error' };
    }

    // Position = current max + 1 so the item appears at the bottom of the
    // checklist. Matches POST /api/deals/[id]/checklist.
    const { data: maxRow } = await supabase
      .from('DealChecklistItem')
      .select('position')
      .eq('dealId', args.dealId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPosition = (maxRow?.position ?? -1) + 1;

    const itemId = crypto.randomUUID();
    const { data: inserted, error: insertErr } = await supabase
      .from('DealChecklistItem')
      .insert({
        id: itemId,
        dealId: args.dealId,
        spaceId: ctx.space.id,
        kind: args.kind,
        label: args.label.trim().slice(0, 200),
        dueAt: args.dueAt ? new Date(args.dueAt).toISOString() : null,
        position: nextPosition,
      })
      .select('id, dealId, kind, label, dueAt')
      .single();
    if (insertErr || !inserted) {
      logger.error(
        '[tools.add_checklist_item] insert failed',
        { dealId: args.dealId },
        insertErr,
      );
      return {
        summary: `Failed to add checklist item: ${insertErr?.message ?? 'unknown error'}`,
        display: 'error',
      };
    }

    const dueBlurb = inserted.dueAt
      ? ` (due ${new Date(inserted.dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
      : '';
    return {
      summary: `Added "${inserted.label}"${dueBlurb} to "${deal.title}".`,
      data: {
        itemId: inserted.id,
        dealId: inserted.dealId,
        kind: inserted.kind,
        label: inserted.label,
        dueAt: inserted.dueAt,
      },
      display: 'success',
    };
  },
});
