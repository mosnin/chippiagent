/**
 * `mark_person_cold` — demote a contact to the cold tier.
 *
 * Approval-gated. Sets scoreLabel='cold' and clamps leadScore down to 30 if
 * it was higher (preserves anything already lower). Logs the reason.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { syncContact } from '@/lib/vectorize';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';
import type { Contact } from '@/lib/types';

const COLD_CEILING = 30;

const parameters = z
  .object({
    personId: z.string().min(1).describe('The Contact.id to mark cold.'),
    why: z
      .string()
      .min(1)
      .max(500)
      .describe('Why this person is cold — recorded on the timeline.'),
  })
  .describe('Mark a contact as a cold lead.');

interface MarkColdResult {
  contactId: string;
  leadScore: number;
}

export const markPersonColdTool = defineTool<typeof parameters, MarkColdResult>({
  name: 'mark_person_cold',
  riskLevel: 'low',
  description:
    "Mark a contact as a cold lead. Tags scoreLabel='cold' and clamps lead score downward. Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 100, windowSeconds: 3600 },
  summariseCall(args) {
    return `Mark contact ${args.personId.slice(0, 8)} as cold`;
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

    const current = contact.leadScore ?? COLD_CEILING;
    const newScore = current > COLD_CEILING ? COLD_CEILING : current;

    const { error: updateErr } = await supabase
      .from('Contact')
      .update({
        scoreLabel: 'cold',
        leadScore: newScore,
        scoringStatus: 'scored',
        updatedAt: new Date().toISOString(),
      })
      .eq('id', args.personId)
      .eq('spaceId', ctx.space.id);
    if (updateErr) {
      logger.error(
        '[tools.mark_person_cold] update failed',
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
      content: `Marked cold: ${args.why}`,
      metadata: { scoreLabel: 'cold', leadScore: newScore, via: 'on_demand_agent' },
    });
    if (activityErr) {
      logger.warn(
        '[tools.mark_person_cold] activity insert failed',
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
        logger.warn('[tools.mark_person_cold] vector sync failed', { contactId: args.personId }, err),
      );
    }

    return {
      summary: `Marked ${contact.name || 'contact'} cold.`,
      data: { contactId: args.personId, leadScore: newScore },
      display: 'success',
    };
  },
});
