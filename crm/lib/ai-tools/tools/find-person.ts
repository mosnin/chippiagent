/**
 * `find_person` — locate a person in the workspace and return enough context
 * for the agent to act WITHOUT a follow-up lookup call.
 *
 * Read-only. Single-result responses are rich (score, recency, active deals);
 * ambiguous matches return a shortlist (≤8) of the same shape so the agent
 * can pick without another round-trip.
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
      .describe('Free-text search across name, email, phone, and preferences.'),
    scoreLabel: z
      .enum(['hot', 'warm', 'cold', 'unscored'])
      .optional()
      .describe('Filter by AI lead-score tier.'),
    leadType: z
      .enum(['rental', 'buyer'])
      .optional()
      .describe('Filter by buyer vs rental.'),
    hasOverdueFollowUp: z
      .boolean()
      .optional()
      .describe('Restrict to people whose follow-up date is in the past.'),
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
    'Find one person by name, email, or phone (or filter the workspace). At least one of `query` / `scoreLabel` / `leadType` / `hasOverdueFollowUp` should be provided.',
  );

interface PersonContext {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  leadScore: number | null;
  scoreLabel: string | null;
  type: 'QUALIFICATION' | 'TOUR' | 'APPLICATION';
  status: 'active' | 'snoozed';
  followUpAt: string | null;
  days_since_last_touch: number | null;
  most_recent_activity: string | null;
  active_deal_count: number;
}

interface FindPersonResult {
  match: 'single' | 'shortlist' | 'none';
  person?: PersonContext;
  people?: PersonContext[];
}

const ACTIVITY_PREVIEW_MAX = 80;

function trimContent(s: string | null): string | null {
  if (!s) return null;
  const v = s.trim().replace(/\s+/g, ' ');
  if (!v) return null;
  return v.length <= ACTIVITY_PREVIEW_MAX ? v : v.slice(0, ACTIVITY_PREVIEW_MAX - 1) + '…';
}

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

interface RawContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  leadScore: number | null;
  scoreLabel: string | null;
  type: 'QUALIFICATION' | 'TOUR' | 'APPLICATION';
  followUpAt: string | null;
  lastContactedAt: string | null;
  snoozedUntil: string | null;
}

async function enrichOne(c: RawContact, spaceId: string, now: Date): Promise<PersonContext> {
  // Most-recent activity (one-liner) and active-deal count run in parallel.
  const [activityRes, dealRes] = await Promise.all([
    supabase
      .from('ContactActivity')
      .select('type, content, createdAt')
      .eq('contactId', c.id)
      .eq('spaceId', spaceId)
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('DealContact')
      .select('Deal!inner(id, status)')
      .eq('contactId', c.id),
  ]);

  let mostRecent: string | null = null;
  if (activityRes.data) {
    const row = activityRes.data as { type: string; content: string | null; createdAt: string };
    const date = row.createdAt.slice(0, 10);
    const content = trimContent(row.content);
    mostRecent = content ? `${date} — ${row.type}: ${content}` : `${date} — ${row.type}`;
  }

  const dealRows =
    (dealRes.data ?? []) as unknown as Array<{ Deal: { id: string; status: string } | null }>;
  const activeDealCount = dealRows.filter((r) => r.Deal && r.Deal.status === 'active').length;

  // Recency: prefer lastContactedAt; fall back to most-recent activity date.
  const recencyAnchor =
    c.lastContactedAt ?? (activityRes.data ? (activityRes.data as { createdAt: string }).createdAt : null);

  const snoozed = c.snoozedUntil ? new Date(c.snoozedUntil) > now : false;

  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    leadScore: c.leadScore,
    scoreLabel: c.scoreLabel,
    type: c.type,
    status: snoozed ? 'snoozed' : 'active',
    followUpAt: c.followUpAt,
    days_since_last_touch: daysSince(recencyAnchor, now),
    most_recent_activity: mostRecent,
    active_deal_count: activeDealCount,
  };
}

function summariseOne(p: PersonContext): string {
  const parts: string[] = [p.name];
  if (p.scoreLabel && p.leadScore != null) {
    parts.push(`${p.scoreLabel} ${Math.round(p.leadScore)}`);
  }
  if (p.days_since_last_touch != null) {
    parts.push(
      p.days_since_last_touch === 0
        ? 'touched today'
        : `${p.days_since_last_touch}d since last touch`,
    );
  } else {
    parts.push('no contact yet');
  }
  if (p.active_deal_count > 0) {
    parts.push(`${p.active_deal_count} active deal${p.active_deal_count === 1 ? '' : 's'}`);
  }
  if (p.followUpAt && new Date(p.followUpAt) < new Date()) {
    parts.push('follow-up overdue');
  }
  if (p.status === 'snoozed') parts.push('snoozed');
  return parts.join(' · ');
}

export const findPersonTool = defineTool<typeof parameters, FindPersonResult>({
  name: 'find_person',
  riskLevel: 'safe',
  description:
    "Find a person in this workspace by name, email, or phone. Returns the person's full context — score, last activity, active deals — so you don't need a follow-up call.",
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const limit = Math.min(args.limit ?? 8, 8);

    let query = supabase
      .from('Contact')
      .select(
        'id, name, email, phone, leadScore, scoreLabel, type, followUpAt, lastContactedAt, snoozedUntil',
      )
      .eq('spaceId', ctx.space.id)
      .is('brokerageId', null)
      .order('updatedAt', { ascending: false })
      .limit(limit);

    if (args.scoreLabel) query = query.eq('scoreLabel', args.scoreLabel);
    if (args.leadType) query = query.eq('leadType', args.leadType);
    if (args.hasOverdueFollowUp) {
      query = query.not('followUpAt', 'is', null).lte('followUpAt', new Date().toISOString());
    }
    if (args.query) {
      const escaped = args.query
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_')
        .replace(/[,()]/g, '');
      const pat = `%${escaped}%`;
      query = query.or(
        `name.ilike.${pat},email.ilike.${pat},phone.ilike.${pat},preferences.ilike.${pat}`,
      );
    }

    const { data, error } = await query.abortSignal(ctx.signal);
    if (error) {
      return {
        summary: `Lookup failed: ${error.message}`,
        data: { match: 'none' as const },
        display: 'error',
      };
    }

    const rows = (data ?? []) as RawContact[];
    if (rows.length === 0) {
      return {
        summary: 'No people matched.',
        data: { match: 'none' as const },
        display: 'contacts',
      };
    }

    const now = new Date();

    // Single, unambiguous result OR an exact case-insensitive name match
    // when a name was provided → return the rich single shape.
    const exactName = args.query
      ? rows.find((r) => r.name.toLowerCase() === args.query!.trim().toLowerCase())
      : undefined;
    if (rows.length === 1 || exactName) {
      const winner: RawContact = exactName ?? rows[0];
      const person = await enrichOne(winner, ctx.space.id, now);
      return {
        summary: summariseOne(person),
        data: { match: 'single' as const, person },
        display: 'contacts',
      };
    }

    // Ambiguous → enrich the shortlist (parallel; small N).
    const people = await Promise.all(rows.map((r) => enrichOne(r, ctx.space.id, now)));
    const lines = people.map((p) => `• ${summariseOne(p)}`).join('\n');
    return {
      summary: `Found ${people.length} people:\n${lines}`,
      data: { match: 'shortlist' as const, people },
      display: 'contacts',
    };
  },
});
