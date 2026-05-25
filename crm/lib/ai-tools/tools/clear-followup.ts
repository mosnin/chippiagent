/**
 * `clear_followup` — drop the scheduled follow-up on a contact.
 *
 * Approval-gated because clearing a follow-up makes the contact disappear
 * from the Today inbox, and the realtor should sign off on that. The model
 * has to say WHY — that line goes into the activity log so the next
 * person looking at the contact can see what happened.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    personId: z.string().min(1).describe('The Contact.id to clear the follow-up on.'),
    why: z
      .string()
      .min(1)
      .max(500)
      .describe('Why we are clearing this follow-up — gets written to the timeline.'),
  })
  .describe('Clear a contact\'s scheduled follow-up.');

interface ClearFollowupResult {
  contactId: string;
}

export const clearFollowupTool = defineTool<typeof parameters, ClearFollowupResult>({
  name: 'clear_followup',
  riskLevel: 'low',
  description:
    "Clear a contact's scheduled follow-up. Requires a reason — it goes on the timeline. Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 200, windowSeconds: 3600 },
  summariseCall(args) {
    return `Clear follow-up on contact ${args.personId.slice(0, 8)}`;
  },

  async handler(args, ctx) {
    const { data: contact, error: lookupErr } = await supabase
      .from('Contact')
      .select('id, name')
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

    const { error: updateErr } = await supabase
      .from('Contact')
      .update({ followUpAt: null, updatedAt: new Date().toISOString() })
      .eq('id', args.personId)
      .eq('spaceId', ctx.space.id);
    if (updateErr) {
      logger.error(
        '[tools.clear_followup] update failed',
        { contactId: args.personId },
        updateErr,
      );
      return { summary: `Update failed: ${updateErr.message}`, display: 'error' };
    }

    const { error: activityErr } = await supabase.from('ContactActivity').insert({
      id: crypto.randomUUID(),
      contactId: args.personId,
      spaceId: ctx.space.id,
      type: 'note',
      content: `Follow-up cleared: ${args.why}`,
      metadata: { via: 'on_demand_agent' },
    });
    if (activityErr) {
      logger.warn(
        '[tools.clear_followup] activity insert failed',
        { contactId: args.personId },
        activityErr,
      );
    }

    return {
      summary: `Cleared follow-up on ${contact.name || 'contact'}.`,
      data: { contactId: args.personId },
      display: 'success',
    };
  },
});
