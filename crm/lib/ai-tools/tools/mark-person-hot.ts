/**
 * `mark_person_hot` — promote a contact to the hot tier.
 *
 * Approval-gated: tier changes drive who appears in the morning story and
 * who triggers brokerage-level new-lead notifications, so the realtor wants
 * a checkpoint.
 *
 * Sets scoreLabel='hot' and bumps leadScore up to at least HOT_LEAD_THRESHOLD
 * (preserves a higher existing score). Inserts a status_change activity with
 * the reason. Re-syncs vector search so "hot" appears in semantic queries.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { syncContact } from '@/lib/vectorize';
import { logger } from '@/lib/logger';
import { HOT_LEAD_THRESHOLD } from '@/lib/constants';
import { defineTool } from '../types';
import type { Contact } from '@/lib/types';

const parameters = z
  .object({
    personId: z.string().min(1).describe('The Contact.id to mark hot.'),
    why: z
      .string()
      .min(1)
      .max(500)
      .describe('Why this person is hot — recorded on the timeline.'),
  })
  .describe('Mark a contact as a hot lead.');

interface MarkHotResult {
  contactId: string;
  leadScore: number;
}

export const markPersonHotTool = defineTool<typeof parameters, MarkHotResult>({
  name: 'mark_person_hot',
  riskLevel: 'low',
  description:
    "Mark a contact as a hot lead. Bumps lead score to at least the hot threshold and tags scoreLabel='hot'. Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 100, windowSeconds: 3600 },
  summariseCall(args) {
    return `Mark contact ${args.personId.slice(0, 8)} as hot`;
  },

  async handler(args, ctx) {
    const { data: contact, error: lookupErr } = await supabase
      .from('Contact')
      .select('id, name, leadScore')
      .eq('id', args.personId)
      .eq('spaceId', ctx.space.id)
      .is('brokerageId', null)
      .maybeSingle();
    if (lookupErr) {
      return { summary: `Contact lookup failed: ${lookupErr.message}`, display: 'error' };
    }
    if (!contact) {
      return {
        summary: `No contact with id "${args.personId}" in this workspace.`,
        display: 'error',
      };
    }

    const newScore = Math.max(contact.leadScore ?? 0, HOT_LEAD_THRESHOLD);

    const { error: updateErr } = await supabase
      .from('Contact')
      .update({
        scoreLabel: 'hot',
        leadScore: newScore,
        scoringStatus: 'scored',
        updatedAt: new Date().toISOString(),
      })
      .eq('id', args.personId)
      .eq('spaceId', ctx.space.id);
    if (updateErr) {
      logger.error(
        '[tools.mark_person_hot] update failed',
        { contactId: args.personId },
        updateErr,
      );
      return { summary: `Update failed: ${updateErr.message}`, display: 'error' };
    }

    const { error: activityErr } = await supabase.from('ContactActivity').insert({
      id: crypto.randomUUID(),
      contactId: args.personId,
      spaceId: ctx.space.id,
      type: 'status_change',
      content: `Marked hot: ${args.why}`,
      metadata: { scoreLabel: 'hot', leadScore: newScore, via: 'on_demand_agent' },
    });
    if (activityErr) {
      logger.warn(
        '[tools.mark_person_hot] activity insert failed',
        { contactId: args.personId },
        activityErr,
      );
    }

    const { data: refreshed } = await supabase
      .from('Contact')
      .select('*')
      .eq('id', args.personId)
      .maybeSingle();
    if (refreshed) {
      syncContact(refreshed as Contact).catch((err) =>
        logger.warn('[tools.mark_person_hot] vector sync failed', { contactId: args.personId }, err),
      );
    }

    return {
      summary: `Marked ${contact.name || 'contact'} hot.`,
      data: { contactId: args.personId, leadScore: newScore },
      display: 'success',
    };
  },
});
