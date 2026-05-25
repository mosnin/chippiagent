/**
 * `note_on_person` — append a plain note to a contact's timeline.
 *
 * Plain. No formatting magic, no auto-tagging, no mood inference. The
 * realtor said "log this", we log this.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    personId: z.string().min(1).describe('The Contact.id to add the note to.'),
    content: z
      .string()
      .min(1)
      .max(5000)
      .describe('The note text. Stored verbatim.'),
  })
  .describe('Add a plain note to a contact.');

interface NoteOnPersonResult {
  contactId: string;
  activityId: string;
}

export const noteOnPersonTool = defineTool<typeof parameters, NoteOnPersonResult>({
  name: 'note_on_person',
  riskLevel: 'low',
  description:
    "Add a plain note to a contact's timeline. Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 200, windowSeconds: 3600 },
  summariseCall(args) {
    return `Add note to contact ${args.personId.slice(0, 8)}`;
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

    const activityId = crypto.randomUUID();
    const { error: activityErr } = await supabase.from('ContactActivity').insert({
      id: activityId,
      contactId: args.personId,
      spaceId: ctx.space.id,
      type: 'note',
      content: args.content,
      metadata: { via: 'on_demand_agent' },
    });
    if (activityErr) {
      logger.error(
        '[tools.note_on_person] insert failed',
        { contactId: args.personId },
        activityErr,
      );
      return { summary: `Couldn't save the note: ${activityErr.message}`, display: 'error' };
    }

    return {
      summary: `Note added to ${contact.name || 'contact'}.`,
      data: { contactId: args.personId, activityId },
      display: 'success',
    };
  },
});
