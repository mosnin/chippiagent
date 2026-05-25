/**
 * `log_meeting` — append an in-person meeting to the contact's audit trail.
 *
 * Same shape as log_call but type='meeting' and metadata.location instead of
 * sentiment/duration. Bumps lastContactedAt and reindexes search.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { syncContact } from '@/lib/vectorize';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';
import type { Contact } from '@/lib/types';

const parameters = z
  .object({
    personId: z.string().min(1).describe('The Contact.id the meeting was with.'),
    summary: z
      .string()
      .min(1)
      .max(5000)
      .describe('Plain-English summary of what happened in the meeting.'),
    location: z
      .string()
      .max(300)
      .optional()
      .describe('Where the meeting happened (address, café name, "Zoom", etc.).'),
  })
  .describe('Log an in-person or virtual meeting against a contact.');

interface LogMeetingResult {
  contactId: string;
  activityId: string;
}

export const logMeetingTool = defineTool<typeof parameters, LogMeetingResult>({
  name: 'log_meeting',
  riskLevel: 'low',
  description:
    "Log a meeting on a contact's timeline. Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 200, windowSeconds: 3600 },
  summariseCall(args) {
    const where = args.location ? ` at ${args.location}` : '';
    return `Log meeting${where} on contact ${args.personId.slice(0, 8)}`;
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
      type: 'meeting',
      content: args.summary,
      metadata: {
        location: args.location ?? null,
        via: 'on_demand_agent',
      },
    });
    if (activityErr) {
      logger.error(
        '[tools.log_meeting] activity insert failed',
        { contactId: args.personId },
        activityErr,
      );
      return { summary: `Couldn't log the meeting: ${activityErr.message}`, display: 'error' };
    }

    const { error: updateErr } = await supabase
      .from('Contact')
      .update({ lastContactedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .eq('id', args.personId)
      .eq('spaceId', ctx.space.id);
    if (updateErr) {
      logger.warn(
        '[tools.log_meeting] lastContactedAt update failed',
        { contactId: args.personId },
        updateErr,
      );
    }

    const { data: refreshed } = await supabase
      .from('Contact')
      .select('*')
      .eq('id', args.personId)
      .maybeSingle();
    if (refreshed) {
      syncContact(refreshed as Contact).catch((err) =>
        logger.warn('[tools.log_meeting] vector sync failed', { contactId: args.personId }, err),
      );
    }

    return {
      summary: `Logged meeting with ${contact.name || 'contact'}.`,
      data: { contactId: args.personId, activityId },
      display: 'success',
    };
  },
});
