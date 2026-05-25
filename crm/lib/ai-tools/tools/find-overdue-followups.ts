/**
 * `find_overdue_followups` — contacts whose followUpAt has passed.
 *
 * Read-only. The follow-up date is a realtor-set field; this is the simplest
 * signal of "you said you'd circle back, you haven't."
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';

const parameters = z
  .object({})
  .describe('Contacts whose followUpAt is in the past.');

interface OverdueFollowUp {
  id: string;
  name: string;
  followUpAt: string;
  daysOverdue: number;
}

interface FindOverdueResult {
  people: OverdueFollowUp[];
}

export const findOverdueFollowupsTool = defineTool<typeof parameters, FindOverdueResult>({
  name: 'find_overdue_followups',
  riskLevel: 'safe',
  description: 'Contacts where followUpAt is in the past. Up to 10, oldest first.',
  parameters,
  requiresApproval: false,

  async handler(_args, ctx) {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('Contact')
      .select('id, name, followUpAt')
      .eq('spaceId', ctx.space.id)
      .is('brokerageId', null)
      .not('followUpAt', 'is', null)
      .lte('followUpAt', nowIso)
      .order('followUpAt', { ascending: true })
      .limit(10)
      .abortSignal(ctx.signal);

    if (error) {
      return { summary: `Overdue lookup failed: ${error.message}`, display: 'error' };
    }

    const rows = (data ?? []) as Array<{ id: string; name: string; followUpAt: string }>;
    if (rows.length === 0) {
      return {
        summary: 'No follow-ups overdue.',
        data: { people: [] },
        display: 'contacts',
      };
    }

    const now = Date.now();
    const people: OverdueFollowUp[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      followUpAt: r.followUpAt,
      daysOverdue: Math.max(0, Math.floor((now - new Date(r.followUpAt).getTime()) / 86_400_000)),
    }));

    return {
      summary: `${people.length} follow-up${people.length === 1 ? '' : 's'} overdue.`,
      data: { people },
      display: 'contacts',
    };
  },
});
