/**
 * `assign_lead_to_realtor` — broker reassigns a Contact to a realtor.
 *
 * Approval-gated. Broker-only. Mirrors the assignment record-keeping in
 * `app/api/broker/assign-lead/route.ts` (audit metadata in
 * applicationStatusNote, plus a 'note' ContactActivity entry), but
 * intentionally narrower: we update the existing Contact row's audit fields
 * — we do NOT clone the contact into another realtor's space here. The
 * route does the clone for first-time assignment from the broker's intake
 * pool. This tool reassigns an already-owned lead within the brokerage,
 * which is a smaller operation. Cloning/notification is what the
 * assign-lead route exists for; the agent should call that surface for
 * first-touch lead drops, not this tool.
 *
 * Note: Contact has no `assignedToUserId` column — assignment is recorded
 * via tags + applicationStatusNote (canonical) and the activity note
 * (audit trail). That's the existing convention.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    personId: z.string().min(1).describe('Contact.id to reassign.'),
    realtorUserId: z.string().min(1).describe('User.id of the new owner realtor.'),
    why: z.string().trim().min(1).max(280).describe('Reassignment reason — appears in the activity log.'),
  })
  .describe('Reassign a Contact to a different realtor in the same brokerage.');

interface AssignResult {
  contactId: string;
  realtorUserId: string;
  realtorName: string;
}

export const assignLeadToRealtorTool = defineTool<typeof parameters, AssignResult>({
  name: 'assign_lead_to_realtor',
  riskLevel: 'low',
  description:
    'Broker-only. Reassign a Contact to a different realtor in the same brokerage. Prompts for approval.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 60, windowSeconds: 3600 },
  summariseCall(args) {
    return `Reassign contact ${args.personId.slice(0, 8)} → realtor ${args.realtorUserId.slice(0, 8)}: ${args.why}`;
  },

  async handler(args, ctx) {
    // ── Broker-role gate ────────────────────────────────────────────────────
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
      .select('brokerageId')
      .eq('userId', (callerUser as { id: string }).id)
      .in('role', ['broker_owner', 'broker_admin']);
    const callerBrokerageIds = new Set(
      ((callerMemberships ?? []) as Array<{ brokerageId: string }>).map((m) => m.brokerageId),
    );
    if (callerBrokerageIds.size === 0) {
      return { summary: 'Broker access required.', display: 'error' };
    }

    // ── Realtor must be in the same brokerage ──────────────────────────────
    const { data: realtorMembership } = await supabase
      .from('BrokerageMembership')
      .select('brokerageId, userId')
      .eq('userId', args.realtorUserId)
      .maybeSingle();
    if (
      !realtorMembership ||
      !callerBrokerageIds.has((realtorMembership as { brokerageId: string }).brokerageId)
    ) {
      return { summary: 'That realtor is not in your brokerage.', display: 'error' };
    }

    // ── Contact must exist (in this space OR linked to the brokerage) ──────
    const { data: contact } = await supabase
      .from('Contact')
      .select('id, name, spaceId, brokerageId')
      .eq('id', args.personId)
      .maybeSingle();
    if (!contact) {
      return { summary: 'Contact not found.', display: 'error' };
    }
    const c = contact as { id: string; name: string; spaceId: string; brokerageId: string | null };
    const brokerageId = (realtorMembership as { brokerageId: string }).brokerageId;
    const callerOwnsThisContact = c.spaceId === ctx.space.id || c.brokerageId === brokerageId;
    if (!callerOwnsThisContact) {
      return { summary: 'Contact not in your brokerage.', display: 'error' };
    }

    // ── Fetch realtor name for the audit note ──────────────────────────────
    const { data: realtor } = await supabase
      .from('User')
      .select('id, name, email')
      .eq('id', args.realtorUserId)
      .maybeSingle();
    const realtorName =
      (realtor as { name?: string | null } | null)?.name ??
      (realtor as { email?: string } | null)?.email ??
      args.realtorUserId;

    // ── Audit-only update: applicationStatusNote + activity note. No clone.
    const now = new Date().toISOString();
    const meta = JSON.stringify({
      assignedTo: args.realtorUserId,
      assignedToName: realtorName,
      assignedAt: now,
      via: 'on_demand_agent',
      reason: args.why,
    });

    const { error: updateErr } = await supabase
      .from('Contact')
      .update({ applicationStatusNote: meta, updatedAt: now })
      .eq('id', c.id);
    if (updateErr) {
      logger.error('[tools.assign_lead] update failed', { contactId: c.id }, updateErr);
      return { summary: `Reassignment failed: ${updateErr.message}`, display: 'error' };
    }

    const { error: activityErr } = await supabase.from('ContactActivity').insert({
      id: crypto.randomUUID(),
      contactId: c.id,
      spaceId: c.spaceId,
      type: 'note',
      content: `Reassigned to ${realtorName}: ${args.why}`,
      metadata: { realtorUserId: args.realtorUserId, via: 'on_demand_agent' },
    });
    if (activityErr) {
      logger.warn('[tools.assign_lead] activity insert failed', { contactId: c.id }, activityErr);
    }

    return {
      summary: `Reassigned ${c.name} to ${realtorName}.`,
      data: { contactId: c.id, realtorUserId: args.realtorUserId, realtorName },
      display: 'success',
    };
  },
});
