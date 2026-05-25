/**
 * `note_on_property` — append a dated note to Property.notes.
 *
 * Schema reality: Property has a single `notes TEXT` column (not an
 * activity table, not a jsonb array). The smallest defensible move is
 * to append `\n[YYYY-MM-DD] <content>` so notes stay human-readable
 * and chronological without a migration. If property notes ever need
 * structured activity, that's a separate Property.notes → PropertyActivity
 * migration — not part of this tool.
 *
 * Approval-gated: notes ride along on the listing card; the realtor
 * sees the text before it goes in.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    propertyId: z.string().min(1).describe('The Property.id to note on.'),
    content: z.string().min(1).max(2000).describe('The note text.'),
  })
  .describe('Append a dated note to a property.');

interface NoteOnPropertyResult {
  propertyId: string;
  appendedLine: string;
}

export const noteOnPropertyTool = defineTool<typeof parameters, NoteOnPropertyResult>({
  name: 'note_on_property',
  riskLevel: 'low',
  description:
    "Add a note to a property's notes log. Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 60, windowSeconds: 3600 },
  summariseCall(args) {
    const preview = args.content.length > 60 ? args.content.slice(0, 57) + '…' : args.content;
    return `Note on property ${args.propertyId.slice(0, 8)}: ${preview}`;
  },

  async handler(args, ctx) {
    const { data: property, error: fetchErr } = await supabase
      .from('Property')
      .select('id, address, notes')
      .eq('id', args.propertyId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (fetchErr) {
      return { summary: `Property lookup failed: ${fetchErr.message}`, display: 'error' };
    }
    if (!property) {
      return { summary: `No property with id "${args.propertyId}".`, display: 'error' };
    }

    const today = new Date().toISOString().slice(0, 10);
    const trimmed = args.content.trim();
    const appendedLine = `[${today}] ${trimmed}`;
    const existing = ((property.notes as string | null) ?? '').trim();
    const next = existing ? `${existing}\n${appendedLine}` : appendedLine;

    const { error: updateErr } = await supabase
      .from('Property')
      .update({ notes: next, updatedAt: new Date().toISOString() })
      .eq('id', args.propertyId)
      .eq('spaceId', ctx.space.id);
    if (updateErr) {
      logger.error('[tools.note_on_property] update failed', { propertyId: args.propertyId }, updateErr);
      return { summary: `Note save failed: ${updateErr.message}`, display: 'error' };
    }

    return {
      summary: `Note added to ${property.address}.`,
      data: { propertyId: property.id, appendedLine },
      display: 'success',
    };
  },
});
