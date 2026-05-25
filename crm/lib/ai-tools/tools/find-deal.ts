/**
 * `find_deal` — locate a deal in the workspace and return enough context for
 * the agent to act WITHOUT a follow-up `get_deal` call.
 *
 * Read-only. Single-result responses are rich (stage, recency, primary
 * contact); ambiguous matches return a shortlist (≤8) of the same shape.
 *
 * Always scoped to `ctx.space.id`. The handler ignores any spaceId in args.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';

const parameters = z
  .object({
    query: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional()
      .describe('Free-text search across deal title, address, and description.'),
    status: z
      .enum(['active', 'won', 'lost', 'on_hold'])
      .optional()
      .describe('Filter by deal status.'),
    stageName: z
      .string()
      .trim()
      .max(60)
      .optional()
      .describe('Filter by stage name (e.g. "Under Contract").'),
    closingBeforeDays: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe('Return deals with expectedCloseDate within this many days.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(8)
      .optional()
      .default(8)
      .describe('Max shortlist size when ambiguous. Hard cap 8.'),
  })
  .describe(
    'Find a deal by title, address, or filter. Provide at least one filter; empty queries return the most recently updated deals.',
  );

interface DealContext {
  id: string;
  title: string;
  value: number | null;
  stageId: string;
  stageName: string | null;
  status: string;
  daysInStage: number | null;
  daysSinceUpdate: number | null;
  contact_name: string | null;
  property_address: string | null;
  close_date: string | null;
}

interface FindDealResult {
  match: 'single' | 'shortlist' | 'none';
  deal?: DealContext;
  deals?: DealContext[];
}

interface RawDeal {
  id: string;
  title: string;
  address: string | null;
  value: number | null;
  status: string;
  stageId: string;
  closeDate: string | null;
  updatedAt: string;
}

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

async function enrichOne(
  d: RawDeal,
  stageNames: Map<string, string>,
  spaceId: string,
  now: Date,
): Promise<DealContext> {
  // Primary contact via DealContact join. We pull the first row and let
  // ordering match insertion — DealContact has no role-priority ordering at
  // the schema level. Best-effort; null if no contact.
  const { data: dcRows } = await supabase
    .from('DealContact')
    .select('Contact!inner(id, name)')
    .eq('dealId', d.id)
    .limit(1);
  const dcArr = (dcRows ?? []) as unknown as Array<{ Contact: { id: string; name: string } | null }>;
  const contactName = dcArr[0]?.Contact?.name ?? null;
  void spaceId; // RLS already scopes via Contact.spaceId; explicit eq isn't required here.

  return {
    id: d.id,
    title: d.title,
    value: d.value,
    stageId: d.stageId,
    stageName: stageNames.get(d.stageId) ?? null,
    status: d.status,
    // `Deal.stageChangedAt` is optional in the schema (added in migration
    // 20260526000000). Until that migration runs we surface null so the
    // model knows the signal is unavailable instead of crashing the call.
    // After the migration runs in prod we can switch this back to
    // `daysSince(d.stageChangedAt, now)` and add the column back to the
    // SELECT above.
    daysInStage: null,
    daysSinceUpdate: daysSince(d.updatedAt, now),
    contact_name: contactName,
    property_address: d.address,
    close_date: d.closeDate,
  };
}

function fmtMoney(v: number | null): string {
  if (v == null) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(v);
}

function summariseOne(d: DealContext): string {
  const parts: string[] = [d.title];
  if (d.stageName) parts.push(d.stageName);
  if (d.value != null) parts.push(fmtMoney(d.value));
  if (d.daysInStage != null) parts.push(`${d.daysInStage}d in stage`);
  if (d.close_date) {
    parts.push(`closes ${new Date(d.close_date).toLocaleDateString()}`);
  }
  if (d.contact_name) parts.push(d.contact_name);
  return parts.join(' · ');
}

export const findDealTool = defineTool<typeof parameters, FindDealResult>({
  name: 'find_deal',
  riskLevel: 'safe',
  description:
    "Find a deal in this workspace by title, address, or filter. Returns each deal's full context — stage, recency, primary contact — so you don't need a follow-up call.",
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const limit = Math.min(args.limit ?? 8, 8);

    let query = supabase
      .from('Deal')
      .select('id, title, address, value, status, stageId, closeDate, updatedAt')
      .eq('spaceId', ctx.space.id)
      .order('updatedAt', { ascending: false })
      .limit(limit);

    if (args.status) query = query.eq('status', args.status);

    if (args.stageName) {
      const { data: stageRow } = await supabase
        .from('DealStage')
        .select('id')
        .eq('spaceId', ctx.space.id)
        .ilike('name', args.stageName)
        .maybeSingle();
      if (!stageRow?.id) {
        return {
          summary: `No stage named "${args.stageName}" in this workspace.`,
          data: { match: 'none' as const },
          display: 'plain',
        };
      }
      query = query.eq('stageId', stageRow.id);
    }

    if (args.closingBeforeDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + args.closingBeforeDays);
      query = query.not('closeDate', 'is', null).lte('closeDate', cutoff.toISOString());
    }

    if (args.query) {
      const escaped = args.query
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_')
        .replace(/[,()]/g, '');
      const pat = `%${escaped}%`;
      query = query.or(`title.ilike.${pat},address.ilike.${pat},description.ilike.${pat}`);
    }

    const { data, error } = await query.abortSignal(ctx.signal);
    if (error) {
      return {
        summary: `Lookup failed: ${error.message}`,
        data: { match: 'none' as const },
        display: 'error',
      };
    }

    const rows = (data ?? []) as RawDeal[];
    if (rows.length === 0) {
      return {
        summary: 'No deals matched.',
        data: { match: 'none' as const },
        display: 'deals',
      };
    }

    // Resolve stage names for the rows we pulled — single round-trip.
    const stageIds = Array.from(new Set(rows.map((r) => r.stageId).filter(Boolean)));
    const stageNames = new Map<string, string>();
    if (stageIds.length > 0) {
      const { data: stages } = await supabase
        .from('DealStage')
        .select('id, name')
        .in('id', stageIds);
      for (const s of (stages ?? []) as Array<{ id: string; name: string }>) {
        stageNames.set(s.id, s.name);
      }
    }

    const now = new Date();
    const exactTitle = args.query
      ? rows.find((r) => r.title.toLowerCase() === args.query!.trim().toLowerCase())
      : undefined;
    if (rows.length === 1 || exactTitle) {
      const winner: RawDeal = exactTitle ?? rows[0];
      const deal = await enrichOne(winner, stageNames, ctx.space.id, now);
      return {
        summary: summariseOne(deal),
        data: { match: 'single' as const, deal },
        display: 'deals',
      };
    }

    const deals = await Promise.all(rows.map((r) => enrichOne(r, stageNames, ctx.space.id, now)));
    const lines = deals.map((d) => `• ${summariseOne(d)}`).join('\n');
    return {
      summary: `Found ${deals.length} deals:\n${lines}`,
      data: { match: 'shortlist' as const, deals },
      display: 'deals',
    };
  },
});
