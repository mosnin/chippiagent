/**
 * `summarize_realtor` — broker-only rollup of one realtor's recent activity.
 *
 * Read-only. Gated on the caller having a broker_owner / broker_admin
 * BrokerageMembership for the realtor's brokerage. The check mirrors the
 * existing pattern in `lib/permissions.ts` (BrokerageMembership row with
 * role IN ('broker_owner','broker_admin')) but operates on `ctx.userId`
 * (Clerk) rather than going through `auth()` since tools have ctx pre-resolved.
 *
 * Returns: deals (active/won/lost), contacts (newPersons/hotPersons), drafts
 * (pending/sent/approvalRate). All scoped to the realtor's space + windowDays.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';

const parameters = z
  .object({
    realtorUserId: z.string().min(1).describe('User.id of the realtor to summarise.'),
    windowDays: z.number().int().min(1).max(90).optional().default(7),
  })
  .describe('Roll up one realtor\'s recent activity. Broker access required.');

interface SummarizeRealtorResult {
  realtor: { name: string | null; email: string };
  deals: { active: number; won: number; lost: number };
  contacts: { newPersons: number; hotPersons: number };
  drafts: { pending: number; sent: number; approvalRate: number | null };
}

export const summarizeRealtorTool = defineTool<typeof parameters, SummarizeRealtorResult>({
  name: 'summarize_realtor',
  riskLevel: 'safe',
  description:
    'Broker-only. Roll up one realtor\'s deals, contacts, and drafts over the last N days (default 7).',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    // ── Caller must be broker_owner / broker_admin somewhere ────────────────
    const { data: callerUser } = await supabase
      .from('User')
      .select('id')
      .eq('clerkId', ctx.userId)
      .maybeSingle();
    if (!callerUser) {
      return { summary: 'Broker access required.', display: 'error' };
    }
    const { data: callerMemberships } = await supabase
      .from('BrokerageMembership')
      .select('brokerageId, role')
      .eq('userId', (callerUser as { id: string }).id)
      .in('role', ['broker_owner', 'broker_admin']);
    const callerBrokerageIds = new Set(
      ((callerMemberships ?? []) as Array<{ brokerageId: string }>).map((m) => m.brokerageId),
    );
    if (callerBrokerageIds.size === 0) {
      return { summary: 'Broker access required.', display: 'error' };
    }

    // ── Realtor must be in one of the caller's brokerages ───────────────────
    const { data: realtorMembership } = await supabase
      .from('BrokerageMembership')
      .select('brokerageId, userId')
      .eq('userId', args.realtorUserId)
      .maybeSingle();
    if (!realtorMembership) {
      return { summary: 'That user is not a brokerage member.', display: 'error' };
    }
    if (!callerBrokerageIds.has((realtorMembership as { brokerageId: string }).brokerageId)) {
      return { summary: 'Broker access required for that realtor.', display: 'error' };
    }

    // ── Fetch realtor profile + their space ────────────────────────────────
    const [{ data: realtor }, { data: space }] = await Promise.all([
      supabase
        .from('User')
        .select('id, name, email')
        .eq('id', args.realtorUserId)
        .maybeSingle(),
      supabase
        .from('Space')
        .select('id')
        .eq('ownerId', args.realtorUserId)
        .maybeSingle(),
    ]);
    if (!realtor) {
      return { summary: 'Realtor not found.', display: 'error' };
    }
    if (!space) {
      return {
        summary: `${(realtor as { name: string | null }).name ?? 'Realtor'} has no workspace yet.`,
        display: 'error',
      };
    }
    const spaceId = (space as { id: string }).id;

    const windowDays = args.windowDays ?? 7;
    const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();

    // ── Pull aggregates in parallel. We over-select where the count matters
    //    little (drafts) and use head:false counts where it doesn't.
    const [dealsRes, newContactsRes, hotContactsRes, draftsRes] = await Promise.all([
      supabase
        .from('Deal')
        .select('status, updatedAt')
        .eq('spaceId', spaceId)
        .gte('updatedAt', since),
      supabase
        .from('Contact')
        .select('id', { count: 'exact', head: true })
        .eq('spaceId', spaceId)
        .is('brokerageId', null)
        .gte('createdAt', since),
      supabase
        .from('Contact')
        .select('id', { count: 'exact', head: true })
        .eq('spaceId', spaceId)
        .is('brokerageId', null)
        .eq('scoreLabel', 'hot'),
      supabase
        .from('AgentDraft')
        .select('status')
        .eq('spaceId', spaceId)
        .gte('createdAt', since),
    ]);

    const dealRows = (dealsRes.data ?? []) as Array<{ status: string }>;
    const deals = {
      active: dealRows.filter((d) => d.status === 'active').length,
      won: dealRows.filter((d) => d.status === 'won').length,
      lost: dealRows.filter((d) => d.status === 'lost').length,
    };

    const draftRows = (draftsRes.data ?? []) as Array<{ status: string }>;
    const pending = draftRows.filter((d) => d.status === 'pending').length;
    const sent = draftRows.filter((d) => d.status === 'sent').length;
    const decided = draftRows.filter((d) => d.status === 'sent' || d.status === 'dismissed').length;
    const approvalRate = decided === 0 ? null : sent / decided;

    const profile = realtor as { name: string | null; email: string };
    const result: SummarizeRealtorResult = {
      realtor: { name: profile.name, email: profile.email },
      deals,
      contacts: {
        newPersons: newContactsRes.count ?? 0,
        hotPersons: hotContactsRes.count ?? 0,
      },
      drafts: { pending, sent, approvalRate },
    };

    return {
      summary: `${profile.name ?? profile.email}: ${deals.active} active, ${deals.won} won, ${result.contacts.newPersons} new, ${pending} pending drafts.`,
      data: result,
      display: 'plain',
    };
  },
});
