/**
 * `pipeline_summary` — snapshot of what's closing soon + what's stuck.
 *
 * Read-only. The model can use this to answer "how's my pipeline this week"
 * without having to search and aggregate manually. Returns the same buckets
 * the Today inbox surfaces: closing-this-week, stuck, overdue-next-action.
 *
 * Implementation reuses `classifyForStrips` from lib/deals/health so we
 * share one definition of "at risk" between the UI and the agent.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { classifyForStrips } from '@/lib/deals/health';
import type { Deal } from '@/lib/types';
import { defineTool } from '../types';

const parameters = z
  .object({
    includeLostWon: z
      .boolean()
      .optional()
      .default(false)
      .describe('When true, include won/lost deals in counts. Defaults to active-only.'),
  })
  .describe('Pipeline snapshot: closing this week + at-risk + waiting on me.');

type StripFields = Pick<
  Deal,
  | 'id'
  | 'title'
  | 'status'
  | 'value'
  | 'closeDate'
  | 'followUpAt'
  | 'updatedAt'
  | 'nextAction'
  | 'nextActionDueAt'
>;

interface SummaryBucket {
  count: number;
  totalValue: number;
  top: Array<{ id: string; title: string; value: number | null }>;
}

interface Summary {
  active: { count: number; totalValue: number };
  closingThisWeek: SummaryBucket;
  atRisk: SummaryBucket;
  waitingOnMe: SummaryBucket;
}

export const pipelineSummaryTool = defineTool<typeof parameters, { summary: Summary }>({
  name: 'pipeline_summary',
  riskLevel: 'safe',
  description:
    'Snapshot of the user\'s pipeline: active count + value, deals closing this week, at-risk / stuck deals, and deals with overdue next actions. Use for "how\'s my week looking" questions.',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const includeLostWon = args.includeLostWon ?? false;
    let query = supabase
      .from('Deal')
      .select(
        'id, title, status, value, closeDate, followUpAt, updatedAt, nextAction, nextActionDueAt',
      )
      .eq('spaceId', ctx.space.id);
    if (!includeLostWon) {
      query = query.eq('status', 'active');
    }

    const { data, error } = await query.abortSignal(ctx.signal);
    if (error) {
      return {
        summary: `Pipeline snapshot failed: ${error.message}`,
        data: {
          summary: {
            active: { count: 0, totalValue: 0 },
            closingThisWeek: { count: 0, totalValue: 0, top: [] },
            atRisk: { count: 0, totalValue: 0, top: [] },
            waitingOnMe: { count: 0, totalValue: 0, top: [] },
          },
        },
        display: 'error',
      };
    }

    const deals = (data ?? []) as StripFields[];
    const active = deals.filter((d) => d.status === 'active');
    const { closingThisWeek, atRisk, waitingOnMe } = classifyForStrips(active);

    const bucket = (rows: StripFields[]): SummaryBucket => ({
      count: rows.length,
      totalValue: rows.reduce((sum, d) => sum + (d.value ?? 0), 0),
      top: rows.slice(0, 5).map((d) => ({ id: d.id, title: d.title, value: d.value })),
    });

    const summary: Summary = {
      active: {
        count: active.length,
        totalValue: active.reduce((sum, d) => sum + (d.value ?? 0), 0),
      },
      closingThisWeek: bucket(closingThisWeek),
      atRisk: bucket(atRisk),
      waitingOnMe: bucket(waitingOnMe),
    };

    const fmt = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });

    const lines: string[] = [
      `Pipeline: ${summary.active.count} active deal${summary.active.count === 1 ? '' : 's'} worth ${fmt.format(summary.active.totalValue)}.`,
    ];
    if (summary.closingThisWeek.count > 0) {
      lines.push(
        `• ${summary.closingThisWeek.count} closing this week (${fmt.format(summary.closingThisWeek.totalValue)})`,
      );
    }
    if (summary.atRisk.count > 0) {
      lines.push(`• ${summary.atRisk.count} at risk or stuck`);
    }
    if (summary.waitingOnMe.count > 0) {
      lines.push(`• ${summary.waitingOnMe.count} with an overdue next action`);
    }
    if (lines.length === 1 && summary.active.count > 0) {
      lines.push('Nothing urgent — everything moving.');
    }

    return {
      summary: lines.join('\n'),
      data: { summary },
      display: 'plain',
    };
  },
});
