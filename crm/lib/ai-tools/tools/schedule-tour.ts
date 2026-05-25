/**
 * `schedule_tour` — create a Tour row.
 *
 * Approval-gated: the tour lands on the realtor's calendar, and a
 * misclicked time/address is annoying to unwind. The user sees the
 * full prompt (guest, property, start/end) before we commit.
 *
 * Mirrors POST /api/tours. Google Calendar syncing happens server-side
 * on a separate cron job — we don't duplicate it here.
 *
 * Either `contactId` (preferred, links to a saved Contact) or
 * `guestName` + `guestEmail` (off-platform guest) is required. The
 * tool refines that constraint so the model cannot submit an empty
 * invitee.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

const parameters = z
  .object({
    contactId: z
      .string()
      .min(1)
      .optional()
      .describe('Saved Contact.id to attach. Prefer this when the guest is already in the CRM.'),
    guestName: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Used when the guest isn\'t a saved contact.'),
    guestEmail: z
      .string()
      .email()
      .max(254)
      .optional()
      .describe('Used when the guest isn\'t a saved contact.'),
    guestPhone: z.string().max(20).optional(),
    propertyAddress: z.string().max(500).optional().describe('Where the tour is.'),
    notes: z.string().max(2000).optional(),
    startsAt: z.string().datetime().describe('ISO start time.'),
    endsAt: z.string().datetime().describe('ISO end time. Must be after startsAt.'),
  })
  .refine((v) => v.contactId || (v.guestName && v.guestEmail), {
    message: 'Either contactId or both guestName + guestEmail are required.',
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: 'endsAt must be after startsAt.',
  })
  .describe('Schedule a property tour for a contact or walk-in guest.');

interface ScheduleTourResult {
  tours: Array<{
    tourId: string;
    startsAt: string;
    endsAt: string;
    contactId: string | null;
    guestName: string;
    propertyAddress: string | null;
    status: 'scheduled';
  }>;
}

export const scheduleTourTool = defineTool<typeof parameters, ScheduleTourResult>({
  name: 'schedule_tour',
  riskLevel: 'high',
  description:
    'Schedule a property tour. Uses a saved contact when provided, otherwise captures a walk-in guest. Always prompts for approval.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 30, windowSeconds: 3600 },
  summariseCall(args) {
    // Dates render as UTC so the approval prompt is timezone-unambiguous;
    // the tour still lands correctly because the DB stores the ISO value.
    const when = new Date(args.startsAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    const who = args.contactId ? `contact ${args.contactId.slice(0, 8)}` : args.guestName ?? 'guest';
    const where = args.propertyAddress ? ` at ${args.propertyAddress}` : '';
    return `Schedule tour for ${who}${where} — ${when}`;
  },

  async handler(args, ctx) {
    // Resolve guest from Contact when provided.
    let contactId: string | null = null;
    let guestName = args.guestName ?? '';
    let guestEmail = args.guestEmail ?? '';
    let guestPhone: string | null = args.guestPhone?.trim() || null;

    if (args.contactId) {
      const { data: contact, error } = await supabase
        .from('Contact')
        .select('id, name, email, phone')
        .eq('id', args.contactId)
        .eq('spaceId', ctx.space.id)
        .is('brokerageId', null)
        .maybeSingle();
      if (error) {
        return { summary: `Contact lookup failed: ${error.message}`, display: 'error' };
      }
      if (!contact) {
        return {
          summary: `No contact with id "${args.contactId}" in this workspace.`,
          display: 'error',
        };
      }
      contactId = contact.id;
      // Contact wins when both are provided — the saved profile is canonical.
      guestName = contact.name || guestName;
      guestEmail = contact.email || guestEmail;
      guestPhone = guestPhone ?? contact.phone ?? null;
      if (!guestEmail) {
        return {
          summary: `${contact.name} has no email on file — add one or pass guestEmail explicitly.`,
          display: 'error',
        };
      }
    }

    const tourId = crypto.randomUUID();
    const { data: inserted, error: insertErr } = await supabase
      .from('Tour')
      .insert({
        id: tourId,
        spaceId: ctx.space.id,
        contactId,
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim().toLowerCase(),
        guestPhone,
        propertyAddress: args.propertyAddress?.trim() || null,
        notes: args.notes?.trim() || null,
        startsAt: new Date(args.startsAt).toISOString(),
        endsAt: new Date(args.endsAt).toISOString(),
        status: 'scheduled',
      })
      .select('id, startsAt, endsAt')
      .single();
    if (insertErr || !inserted) {
      logger.error(
        '[tools.schedule_tour] insert failed',
        { spaceId: ctx.space.id },
        insertErr,
      );
      return {
        summary: `Failed to schedule tour: ${insertErr?.message ?? 'unknown error'}`,
        display: 'error',
      };
    }

    // Audit the tour on the Contact's activity feed when linked.
    if (contactId) {
      const { error: activityErr } = await supabase.from('ContactActivity').insert({
        id: crypto.randomUUID(),
        spaceId: ctx.space.id,
        contactId,
        type: 'meeting',
        content: `Tour scheduled${args.propertyAddress ? ` at ${args.propertyAddress}` : ''}`,
        metadata: { tourId, via: 'on_demand_agent' },
      });
      if (activityErr) {
        logger.warn(
          '[tools.schedule_tour] activity insert failed',
          { contactId, tourId },
          activityErr,
        );
      }
    }

    const prettyTime = new Date(inserted.startsAt).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    const where = args.propertyAddress ? ` at ${args.propertyAddress}` : '';
    return {
      summary: `Tour scheduled for ${guestName || 'guest'}${where} — ${prettyTime}.`,
      data: {
        tours: [
          {
            tourId: inserted.id,
            startsAt: inserted.startsAt,
            endsAt: inserted.endsAt,
            contactId,
            guestName,
            propertyAddress: args.propertyAddress?.trim() || null,
            status: 'scheduled',
          },
        ],
      },
      display: 'tours',
    };
  },
});
