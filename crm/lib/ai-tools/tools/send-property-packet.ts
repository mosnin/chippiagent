/**
 * `send_property_packet` — log the intent to share a property packet.
 *
 * Approval-gated. **Does NOT send anything.** This tool only writes a
 * ContactActivity row tagged with `kind: 'property_packet'` so the
 * realtor's audit trail records that the agent queued the packet. The
 * actual delivery (email pipeline, etc.) is fired elsewhere — the agent
 * never moves bytes over the wire.
 *
 * The Python equivalent in `agent/tools/properties.py` creates a real
 * AgentDraft + builds the share URL. The TS chat agent uses the SDK
 * approval flow for messaging tools, so this verb's job is to leave a
 * paper trail that "Chippi proposed sending a packet for X to Y."
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    contactId: z.string().min(1).describe('The Contact.id to share the packet with.'),
    propertyId: z.string().min(1).describe('The Property.id to share.'),
    intent: z
      .string()
      .trim()
      .max(280)
      .optional()
      .describe('Short intent string for the audit log (defaults to "standard").'),
  })
  .describe('Queue a property packet share to a contact.');

interface SendPropertyPacketResult {
  contactId: string;
  propertyId: string;
  activityId: string;
  status: 'queued';
}

export const sendPropertyPacketTool = defineTool<typeof parameters, SendPropertyPacketResult>({
  name: 'send_property_packet',
  riskLevel: 'high',
  description:
    "Queue a property packet share to a contact (logs intent — actual send fires through the email pipeline). Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 60, windowSeconds: 3600 },
  summariseCall(args) {
    const c =
      typeof args?.contactId === 'string' && args.contactId.length > 0
        ? args.contactId.slice(0, 8)
        : 'contact';
    const p =
      typeof args?.propertyId === 'string' && args.propertyId.length > 0
        ? args.propertyId.slice(0, 8)
        : 'property';
    return `Send property packet for ${p} to ${c}`;
  },

  async handler(args, ctx) {
    const { data: contact, error: contactErr } = await supabase
      .from('Contact')
      .select('id, name')
      .eq('id', args.contactId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (contactErr) {
      return { summary: `Contact lookup failed: ${contactErr.message}`, display: 'error' };
    }
    if (!contact) {
      return { summary: `No contact with id "${args.contactId}".`, display: 'error' };
    }

    const { data: property, error: propertyErr } = await supabase
      .from('Property')
      .select('id, address')
      .eq('id', args.propertyId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    if (propertyErr) {
      return { summary: `Property lookup failed: ${propertyErr.message}`, display: 'error' };
    }
    if (!property) {
      return { summary: `No property with id "${args.propertyId}".`, display: 'error' };
    }

    const intent = args.intent?.trim() || 'standard';
    const activityId = crypto.randomUUID();
    const { error: activityErr } = await supabase.from('ContactActivity').insert({
      id: activityId,
      contactId: args.contactId,
      spaceId: ctx.space.id,
      type: 'note',
      content: `Queued property packet for ${property.address} (${intent}).`,
      metadata: {
        kind: 'property_packet',
        propertyId: args.propertyId,
        status: 'queued',
        intent,
        via: 'on_demand_agent',
      },
    });
    if (activityErr) {
      logger.error(
        '[tools.send_property_packet] activity insert failed',
        { contactId: args.contactId, propertyId: args.propertyId },
        activityErr,
      );
      return {
        summary: `Couldn't queue the packet: ${activityErr.message}`,
        display: 'error',
      };
    }

    return {
      summary: `Queued property packet for ${property.address} to ${contact.name || 'contact'}.`,
      data: {
        contactId: args.contactId,
        propertyId: args.propertyId,
        activityId,
        status: 'queued',
      },
      display: 'success',
    };
  },
});
