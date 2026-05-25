/**
 * `find_quiet_hot_persons` — hot leads with no recent contact.
 *
 * Read-only. "Hot" = scoreLabel='hot'. Quiet = no ContactActivity newer
 * than minDaysQuiet days. We resolve activity-recency with a single
 * grouped query rather than per-row N+1.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';

const parameters = z
  .object({
    minDaysQuiet: z.number().int().min(1).max(180).optional().default(7),
  })
  .describe('Hot contacts with no activity newer than minDaysQuiet.');

interface QuietHotPerson {
  id: string;
  name: string;
  leadScore: number | null;
  daysSinceLastTouch: number | null;
}

interface FindQuietHotPersonsResult {
  people: QuietHotPerson[];
}

export const findQuietHotPersonsTool = defineTool<
  typeof parameters,
  FindQuietHotPersonsResult
>({
  name: 'find_quiet_hot_persons',
  riskLevel: 'safe',
  description: 'Find hot-scored contacts who haven\'t been contacted in minDaysQuiet days (default 7).',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const minDays = args.minDaysQuiet ?? 7;
    const now = Date.now();
    const cutoff = new Date(now - minDays * 86_400_000).toISOString();

    const { data, error } = await supabase
      .from('Contact')
      .select('id, name, leadScore, lastContactedAt, updatedAt')
      .eq('spaceId', ctx.space.id)
      .is('brokerageId', null)
      .eq('scoreLabel', 'hot')
      .order('leadScore', { ascending: false })
      .limit(40)
      .abortSignal(ctx.signal);

    if (error) {
      return { summary: `Quiet-hot lookup failed: ${error.message}`, display: 'error' };
    }

    const rows = (data ?? []) as Array<{
      id: string;
      name: string;
      leadScore: number | null;
      lastContactedAt: string | null;
      updatedAt: string;
    }>;
    if (rows.length === 0) {
      return {
        summary: 'No hot contacts in this workspace.',
        data: { people: [] },
        display: 'contacts',
      };
    }

    // For contacts with no lastContactedAt we still want a "quiet for X days"
    // signal — fall back to the most-recent ContactActivity per contact.
    const ids = rows.map((r) => r.id);
    const { data: activities } = await supabase
      .from('ContactActivity')
      .select('contactId, createdAt')
      .eq('spaceId', ctx.space.id)
      .in('contactId', ids)
      .order('createdAt', { ascending: false });
    const lastActMap = new Map<string, string>();
    for (const a of (activities ?? []) as Array<{ contactId: string; createdAt: string }>) {
      if (!lastActMap.has(a.contactId)) lastActMap.set(a.contactId, a.createdAt);
    }

    const people: QuietHotPerson[] = rows
      .map((r) => {
        const anchor = r.lastContactedAt ?? lastActMap.get(r.id) ?? null;
        const daysSinceLastTouch =
          anchor == null
            ? null
            : Math.floor((now - new Date(anchor).getTime()) / 86_400_000);
        return {
          id: r.id,
          name: r.name,
          leadScore: r.leadScore,
          daysSinceLastTouch,
          _anchor: anchor,
        };
      })
      .filter((p) => p.daysSinceLastTouch == null || p.daysSinceLastTouch >= minDays)
      .sort(
        (a, b) =>
          (b.daysSinceLastTouch ?? Number.MAX_SAFE_INTEGER) -
          (a.daysSinceLastTouch ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(0, 10)
      .map(({ _anchor: _drop, ...p }) => p);

    return {
      summary:
        people.length === 0
          ? `No hot contacts have gone quiet for ${minDays}+ days.`
          : `${people.length} hot contact${people.length === 1 ? '' : 's'} quiet for ${minDays}+ days.`,
      data: { people },
      display: 'contacts',
    };
  },
});
