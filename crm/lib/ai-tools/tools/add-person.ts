/**
 * `add_person` — create a new contact in the workspace.
 *
 * Approval-gated. Adding a new person is a meaningful CRM action — it
 * lands on /people, may fire a new-contact notification, gets vectorized
 * for semantic recall, and (if tagged 'new-lead') counts toward the
 * realtor's morning unread-leads number. The realtor confirms the name
 * + key fields before we write.
 *
 * Mirrors POST /api/contacts but the agent contract is shaped for the
 * verbs realtors actually say ("buyer", "$3,200/mo", "looking for a
 * 2BR in Brickell") rather than the HTTP route's superset.
 *
 * Without this tool, the model could call `find_person` to confirm
 * absence but had no way to actually create the person — leading to
 * hallucinated "Successfully added Kimberly Jane" sentences that
 * weren't backed by any DB write. This tool closes that gap.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { syncContact } from '@/lib/vectorize';
import { notifyNewContact } from '@/lib/notify';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';
import type { Contact } from '@/lib/types';

const parameters = z
  .object({
    name: z
      .string()
      .min(1)
      .max(200)
      .describe("The person's full name. Required."),
    email: z
      .string()
      .max(320)
      .nullable()
      .optional()
      .describe('Email address, if known.'),
    phone: z
      .string()
      .max(40)
      .nullable()
      .optional()
      .describe('Phone number in any format the realtor said it.'),
    leadType: z
      .enum(['buyer', 'rental'])
      .nullable()
      .optional()
      .describe(
        'Buyer (purchasing) or rental (looking to lease). Default: buyer if unspecified — most realtors think "buyer" unless told otherwise.',
      ),
    budget: z
      .number()
      .nonnegative()
      .nullable()
      .optional()
      .describe('Budget in dollars. For rentals this is monthly; for buyers, total purchase price.'),
    address: z
      .string()
      .max(500)
      .nullable()
      .optional()
      .describe("The person's home address (NOT the property they want — that goes in `preferences`)."),
    preferences: z
      .string()
      .max(2000)
      .nullable()
      .optional()
      .describe(
        'Free-form: what they\'re looking for, neighborhood, bedroom count, must-haves. Example: "2BR condo in Brickell, building amenities a plus, pet-friendly".',
      ),
    notes: z
      .string()
      .max(5000)
      .nullable()
      .optional()
      .describe('Initial notes about the person. Stored verbatim on the contact record.'),
    tags: z
      .array(z.string().min(1).max(40))
      .max(10)
      .nullable()
      .optional()
      .describe(
        'Optional tags. Use `new-lead` for fresh leads (counts toward the morning unread-leads number); use `hot` only when the realtor explicitly said this person is hot.',
      ),
  })
  .describe(
    'Create a new person in the workspace. Use this when the realtor describes someone new — "add a buyer named ...", "log a new lead ...", etc. Prompts for approval first.',
  );

interface AddPersonResult {
  contactId: string;
  name: string;
  leadType: 'buyer' | 'rental';
}

export const addPersonTool = defineTool<typeof parameters, AddPersonResult>({
  name: 'add_person',
  riskLevel: 'low',
  description:
    'Create a new person (contact) in the workspace with the realtor-provided details. Prompts for approval first.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 60, windowSeconds: 3600 },
  summariseCall(args) {
    const bits: string[] = [args.name];
    if (args.leadType) bits.push(args.leadType);
    if (args.budget != null) bits.push(`$${Number(args.budget).toLocaleString('en-US')}`);
    if (args.preferences) bits.push(args.preferences.slice(0, 80));
    return `Add ${bits.join(' · ')}`;
  },

  async handler(args, ctx) {
    const name = args.name.trim();
    if (!name) {
      return { summary: 'Name is required.', display: 'error' };
    }

    const id = crypto.randomUUID();
    const leadType: 'buyer' | 'rental' = args.leadType ?? 'buyer';
    const tags = (args.tags ?? []).map((t) => t.trim()).filter((t) => t.length > 0);

    const { data: contactRow, error: insertErr } = await supabase
      .from('Contact')
      .insert({
        id,
        spaceId: ctx.space.id,
        // brokerageId stays null — this is a workspace-owned contact, not
        // a brokerage lead. Matches POST /api/contacts which never sets it.
        brokerageId: null,
        name,
        email: args.email?.trim() || null,
        phone: args.phone?.trim() || null,
        address: args.address?.trim() || null,
        notes: args.notes?.trim() || null,
        leadType,
        budget: args.budget ?? null,
        preferences: args.preferences?.trim() || null,
        properties: [],
        tags,
        // type defaults to QUALIFICATION on the HTTP route — keep parity.
        type: 'QUALIFICATION',
      })
      .select()
      .single();

    if (insertErr || !contactRow) {
      logger.error('[tools.add_person] insert failed', { spaceId: ctx.space.id }, insertErr);
      return {
        summary: `Failed to add person: ${insertErr?.message ?? 'unknown error'}`,
        display: 'error',
      };
    }

    // Vector reindex + new-contact notification — best-effort, matches the
    // HTTP route's fire-and-forget pattern.
    syncContact(contactRow as Contact).catch((err) =>
      logger.warn('[tools.add_person] vector sync failed', { contactId: id }, err),
    );

    try {
      await notifyNewContact({
        spaceId: ctx.space.id,
        contactName: name,
        contactPhone: args.phone ?? null,
        contactEmail: args.email ?? null,
        tags,
      });
    } catch (err) {
      logger.warn('[tools.add_person] notification failed', { contactId: id }, err);
    }

    return {
      summary: `Added ${name}${leadType === 'rental' ? ' (rental)' : ''}.`,
      data: {
        contactId: id,
        name,
        leadType,
      },
      display: 'success',
    };
  },
});
