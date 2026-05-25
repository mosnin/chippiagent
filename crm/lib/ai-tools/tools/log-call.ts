/**
 * `log_call` — append a call to the contact's audit trail.
 *
 * Approval-gated because the activity log is what the realtor's brokerage
 * audits at end-of-month. The model writing into it without a "yes" is the
 * kind of thing that erodes trust fast.
 *
 * Inserts a ContactActivity of type 'call' with the model's summary as the
 * content. Bumps Contact.lastContactedAt so the Today inbox sorting reflects
 * the new touch. Re-syncs vector search so the call summary becomes findable.
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
    personId: z.string().min(1).describe('The Contact.id the call was with.'),
    summary: z
      .string()
      .min(1)
      .max(5000)
      .describe('One-paragraph plain-English summary of what was discussed.'),
    sentiment: z
      .enum(['positive', 'neutral', 'negative'])
      .optional()
      .describe('Overall vibe of the call.'),
    durationMins: z
      .number()
      .int()
      .positive()
      .max(720)
      .optional()
      .describe('Length of the call in minutes.'),
  })
  .describe('Log a phone call against a contact.');

interface LogCallResult {
  contactId: string;
  activityId: string;
}

export const logCallTool = defineTool<typeof parameters, LogCallResult>({
  name: 'log_call',
  riskLevel: 'low',
  description:
    "Log a phone call on a contact's timeline. Stores the summary, optional sentiment and duration. Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 200, windowSeconds: 3600 },
  summariseCall(args) {
    const len = args.durationMins ? ` (${args.durationMins}m)` : '';
    return `Log call${len} on contact ${args.personId.slice(0, 8)}`;
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
      type: 'call',
      content: args.summary,
      metadata: {
        sentiment: args.sentiment ?? null,
        durationMins: args.durationMins ?? null,
        via: 'on_demand_agent',
      },
    });
    if (activityErr) {
      logger.error(
        '[tools.log_call] activity insert failed',
        { contactId: args.personId },
        activityErr,
      );
      return { summary: `Couldn't log the call: ${activityErr.message}`, display: 'error' };
    }

    // Bump lastContactedAt — the column we actually have. Non-fatal.
    const { error: updateErr } = await supabase
      .from('Contact')
      .update({ lastContactedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .eq('id', args.personId)
      .eq('spaceId', ctx.space.id);
    if (updateErr) {
      logger.warn(
        '[tools.log_call] lastContactedAt update failed',
        { contactId: args.personId },
        updateErr,
      );
    }

    // Reindex so the call summary is searchable.
    const { data: refreshed } = await supabase
      .from('Contact')
      .select('*')
      .eq('id', args.personId)
      .maybeSingle();
    if (refreshed) {
      syncContact(refreshed as Contact).catch((err) =>
        logger.warn('[tools.log_call] vector sync failed', { contactId: args.personId }, err),
      );
    }

    return {
      summary: `Logged call with ${contact.name || 'contact'}.`,
      data: { contactId: args.personId, activityId },
      display: 'success',
    };
  },
});
