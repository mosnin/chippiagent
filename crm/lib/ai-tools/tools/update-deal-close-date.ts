/**
 * `update_deal_close_date` — move the projected close date on a Deal.
 *
 * Approval-gated: close date drives the pipeline forecast and "what's
 * closing this month" reports. The realtor sees the new date before
 * we commit.
 *
 * Accepts an ISO datetime OR a small set of relative phrases the realtor
 * actually uses ("tomorrow", "next friday", "in 2 weeks"). Anything we
 * can't parse fails with a clear "couldn't read that date" message
 * instead of silently picking a wrong day.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    dealId: z.string().min(1).describe('The Deal.id to update.'),
    when: z
      .string()
      .min(1)
      .max(60)
      .describe('Target close date — ISO datetime OR a phrase like "tomorrow", "next friday", "in 2 weeks", "june 30".'),
    why: z.string().max(500).optional(),
  })
  .describe('Move the projected close date on a deal.');

interface UpdateDealCloseDateResult {
  dealId: string;
  oldCloseDate: string | null;
  newCloseDate: string;
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Resolve a phrase or ISO string to an ISO date. Returns null on failure
 * rather than guessing — the model gets a clear error and can retry with
 * an explicit date.
 */
export function resolveCloseDate(phrase: string, now: Date = new Date()): string | null {
  const trimmed = phrase.trim().toLowerCase();
  if (!trimmed) return null;

  // Try native Date parsing first — covers ISO strings + "june 30 2026".
  const direct = new Date(phrase);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString();
  }

  // "today"
  if (trimmed === 'today') {
    return new Date(now).toISOString();
  }
  // "tomorrow"
  if (trimmed === 'tomorrow') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
  // "in N day(s)|week(s)|month(s)"
  const inMatch = trimmed.match(/^in\s+(\d+)\s+(day|days|week|weeks|month|months)$/);
  if (inMatch) {
    const n = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    const d = new Date(now);
    if (unit.startsWith('day')) d.setDate(d.getDate() + n);
    else if (unit.startsWith('week')) d.setDate(d.getDate() + 7 * n);
    else d.setMonth(d.getMonth() + n);
    return d.toISOString();
  }
  // "next monday" / "this friday"
  const dayMatch = trimmed.match(/^(next|this)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (dayMatch) {
    const target = DAYS.indexOf(dayMatch[2]);
    const d = new Date(now);
    const cur = d.getDay();
    let delta = (target - cur + 7) % 7;
    if (delta === 0 || dayMatch[1] === 'next') delta = delta === 0 ? 7 : delta + (dayMatch[1] === 'next' && delta < 7 ? 0 : 0);
    if (dayMatch[1] === 'next' && delta < 7) delta += delta === 0 ? 7 : 0;
    if (delta === 0) delta = 7;
    d.setDate(d.getDate() + delta);
    return d.toISOString();
  }
  return null;
}

function pretty(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const updateDealCloseDateTool = defineTool<typeof parameters, UpdateDealCloseDateResult>({
  name: 'update_deal_close_date',
  riskLevel: 'low',
  description:
    "Update a deal's projected close date. Accepts ISO or relative phrases. Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 60, windowSeconds: 3600 },
  summariseCall(args) {
    const why = args.why ? ` — ${args.why}` : '';
    return `Move deal ${args.dealId.slice(0, 8)} close date → ${args.when}${why}`;
  },

  async handler(args, ctx) {
    const resolved = resolveCloseDate(args.when);
    if (!resolved) {
      return {
        summary: `Couldn't read "${args.when}" as a date. Try ISO ("2026-07-15") or "next friday" / "in 2 weeks".`,
        display: 'error',
      };
    }

    const { data: deal, error: dealErr } = await supabase
      .from('Deal')
      .select('id, title, closeDate')
      .eq('id', args.dealId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (dealErr) {
      return { summary: `Deal lookup failed: ${dealErr.message}`, display: 'error' };
    }
    if (!deal) {
      return { summary: `No deal with id "${args.dealId}".`, display: 'error' };
    }

    const oldCloseDate = (deal.closeDate as string | null) ?? null;

    const { error: updateErr } = await supabase
      .from('Deal')
      .update({ closeDate: resolved, updatedAt: new Date().toISOString() })
      .eq('id', args.dealId)
      .eq('spaceId', ctx.space.id);
    if (updateErr) {
      logger.error('[tools.update_deal_close_date] update failed', { dealId: args.dealId }, updateErr);
      return { summary: `Update failed: ${updateErr.message}`, display: 'error' };
    }

    const why = args.why ? `: ${args.why}` : '';
    const { error: activityErr } = await supabase.from('DealActivity').insert({
      id: crypto.randomUUID(),
      dealId: args.dealId,
      spaceId: ctx.space.id,
      type: 'note',
      content: `Close date moved to ${args.when}${why}`,
      metadata: { oldCloseDate, newCloseDate: resolved, via: 'on_demand_agent' },
    });
    if (activityErr) {
      logger.warn('[tools.update_deal_close_date] activity insert failed', { dealId: args.dealId }, activityErr);
    }

    return {
      summary: `"${deal.title}" close date set to ${pretty(resolved)}.`,
      data: { dealId: args.dealId, oldCloseDate, newCloseDate: resolved },
      display: 'success',
    };
  },
});
