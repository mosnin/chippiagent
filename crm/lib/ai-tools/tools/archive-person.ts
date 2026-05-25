/**
 * `archive_person` — push a contact out of the active People view.
 *
 * Approval-gated. The Contact table has no archivedAt column, but it does
 * have snoozedUntil — and the People list filters by it (see
 * /api/contacts/route.ts: `snoozedUntil.is.null,snoozedUntil.lte.now`).
 * Setting snoozedUntil to the far future is the existing archive
 * mechanism. The reason gets a 'note' line on the timeline.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

// Year 9999 — same convention used elsewhere for "indefinite" timestamps.
const FAR_FUTURE = '9999-12-31T00:00:00.000Z';

const parameters = z
  .object({
    personId: z.string().min(1).describe('The Contact.id to archive.'),
    reason: z
      .string()
      .min(1)
      .max(500)
      .describe('Why we are archiving this contact — recorded on the timeline.'),
  })
  .describe('Archive a contact (hide from the active People list).');

interface ArchivePersonResult {
  contactId: string;
}

export const archivePersonTool = defineTool<typeof parameters, ArchivePersonResult>({
  name: 'archive_person',
  riskLevel: 'destructive',
  description:
    "Archive a contact — hides them from the active People list. Reversible by clearing snoozedUntil. Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 60, windowSeconds: 3600 },
  summariseCall(args) {
    return `Archive contact ${args.personId.slice(0, 8)}`;
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
      .update({ snoozedUntil: FAR_FUTURE, updatedAt: new Date().toISOString() })
      .eq('id', args.personId)
      .eq('spaceId', ctx.space.id);
    if (updateErr) {
      logger.error(
        '[tools.archive_person] update failed',
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
      content: `Archived: ${args.reason}`,
      metadata: { via: 'on_demand_agent', archive: true },
    });
    if (activityErr) {
      logger.warn(
        '[tools.archive_person] activity insert failed',
        { contactId: args.personId },
        activityErr,
      );
    }

    return {
      summary: `Archived ${contact.name || 'contact'}.`,
      data: { contactId: args.personId },
      display: 'success',
    };
  },
});
