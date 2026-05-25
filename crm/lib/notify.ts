/**
 * Unified notification dispatcher.
 *
 * Sends email (via Resend) and SMS (via Telnyx) notifications to space owners
 * based on their notification preferences in SpaceSetting.
 *
 * Preferences:
 *   - notifications (master email toggle)
 *   - smsNotifications (master SMS toggle)
 *   - notifyNewLeads (per-event: new lead applications)
 *   - notifyTourBookings (per-event: new tour bookings)
 *   - notifyNewDeals (per-event: new deals)
 *   - notifyFollowUps (per-event: follow-up reminders)
 *
 * All functions are non-blocking and never throw.
 */

import { supabase } from '@/lib/supabase';
import { sendNewLeadNotification } from '@/lib/email';
import { sendNewDealNotification } from '@/lib/email';
import { sendAgentNotification, type TourEmailData } from '@/lib/tour-emails';
import { sendSMS, newLeadSMS, newTourSMS, newDealSMS } from '@/lib/sms';
import { formatCompact } from '@/lib/formatting';
import { logger } from '@/lib/logger';

interface SpaceOwnerInfo {
  ownerEmail: string;
  ownerPhone: string | null;
  spaceName: string;
  spaceSlug: string;
  // Channel toggles
  emailEnabled: boolean;
  smsEnabled: boolean;
  // Per-event toggles
  notifyNewLeads: boolean;
  notifyTourBookings: boolean;
  notifyNewDeals: boolean;
  notifyFollowUps: boolean;
}

/**
 * Fetch the space owner's contact info and notification preferences.
 * Returns null if space/owner not found.
 */
async function getSpaceOwnerInfo(spaceId: string): Promise<SpaceOwnerInfo | null> {
  try {
    const [{ data: space }, { data: settings }] = await Promise.all([
      supabase.from('Space').select('ownerId, name, slug').eq('id', spaceId).maybeSingle(),
      supabase
        .from('SpaceSetting')
        .select('notifications, smsNotifications, phoneNumber, notifyNewLeads, notifyTourBookings, notifyNewDeals, notifyFollowUps')
        .eq('spaceId', spaceId)
        .maybeSingle(),
    ]);

    if (!space) return null;

    const { data: owner } = await supabase.from('User').select('email').eq('id', space.ownerId).maybeSingle();
    if (!owner?.email) return null;

    const smsEnabled = settings?.smsNotifications ?? false;
    const ownerPhone = settings?.phoneNumber ?? null;

    // Log diagnostic info for SMS delivery issues
    if (!settings) {
      logger.warn('[notify] no SpaceSetting row — SMS disabled by default', { spaceId });
    } else if (smsEnabled && !ownerPhone) {
      logger.warn('[notify] SMS enabled but no phone configured — skipping', { spaceId });
    } else if (!smsEnabled) {
      logger.debug('[notify] SMS disabled for space', { spaceId });
    }

    return {
      ownerEmail: owner.email,
      ownerPhone,
      spaceName: space.name,
      spaceSlug: space.slug,
      emailEnabled: settings?.notifications ?? true,
      smsEnabled,
      notifyNewLeads: settings?.notifyNewLeads ?? true,
      notifyTourBookings: settings?.notifyTourBookings ?? true,
      notifyNewDeals: settings?.notifyNewDeals ?? true,
      notifyFollowUps: settings?.notifyFollowUps ?? true,
    };
  } catch (err) {
    logger.error('[notify] failed to fetch space owner info', { spaceId }, err);
    return null;
  }
}

// ── New Lead ─────────────────────────────────────────────────────────────

export interface NotifyNewLeadParams {
  spaceId: string;
  contactId: string;
  name: string;
  phone: string;
  email?: string | null;
  budget?: number | null;
  leadScore?: number | null;
  scoreLabel?: string | null;
  scoreSummary?: string | null;
  applicationData: any;
}

/**
 * Notify space owner about a new lead via email + SMS.
 * Respects both the channel toggles AND the notifyNewLeads event toggle.
 */
export async function notifyNewLead(params: NotifyNewLeadParams): Promise<void> {
  const info = await getSpaceOwnerInfo(params.spaceId);
  if (!info) { logger.warn('[notify] no space owner info', { spaceId: params.spaceId }); return; }
  if (!info.notifyNewLeads) { logger.debug('[notify] notifyNewLeads disabled', { spaceId: params.spaceId }); return; }
  logger.info('[notify] sending lead notification', { spaceId: params.spaceId, emailEnabled: info.emailEnabled, smsEnabled: info.smsEnabled });

  const promises: Promise<unknown>[] = [];

  // Email notification
  if (info.emailEnabled) {
    promises.push(
      sendNewLeadNotification({
        toEmail: info.ownerEmail,
        spaceName: info.spaceName,
        spaceSlug: info.spaceSlug,
        contactId: params.contactId,
        name: params.name,
        phone: params.phone,
        email: params.email,
        budget: params.budget,
        leadScore: params.leadScore,
        scoreLabel: params.scoreLabel,
        scoreSummary: params.scoreSummary,
        applicationData: params.applicationData,
      }).catch((err) => logger.error('[notify] lead email failed', { spaceId: params.spaceId }, err))
    );
  }

  // SMS notification
  if (info.smsEnabled && info.ownerPhone) {
    promises.push(
      sendSMS(
        newLeadSMS({
          spaceName: info.spaceName,
          leadName: params.name,
          leadPhone: params.phone,
          phone: info.ownerPhone,
          scoreLabel: params.scoreLabel,
        })
      ).catch((err) => logger.error('[notify] lead SMS failed', { spaceId: params.spaceId }, err))
    );
  }

  await Promise.allSettled(promises);
}

// ── New Tour Booked ──────────────────────────────────────────────────────

export interface NotifyNewTourParams {
  spaceId: string;
  tourData: TourEmailData;
}

/**
 * Notify space owner about a new tour booking via email + SMS.
 * Respects both the channel toggles AND the notifyTourBookings event toggle.
 */
export async function notifyNewTour(params: NotifyNewTourParams): Promise<void> {
  const info = await getSpaceOwnerInfo(params.spaceId);
  if (!info || !info.notifyTourBookings) return;

  const promises: Promise<unknown>[] = [];

  // Email notification to agent
  if (info.emailEnabled) {
    promises.push(
      sendAgentNotification(info.ownerEmail, params.tourData)
        .catch((err) => logger.error('[notify] tour email failed', { spaceId: params.spaceId }, err))
    );
  }

  // SMS notification to agent
  if (info.smsEnabled && info.ownerPhone) {
    const d = new Date(params.tourData.startsAt);
    promises.push(
      sendSMS(
        newTourSMS({
          spaceName: info.spaceName,
          guestName: params.tourData.guestName,
          date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          property: params.tourData.propertyAddress,
          phone: info.ownerPhone,
        })
      ).catch((err) => logger.error('[notify] tour SMS failed', { spaceId: params.spaceId }, err))
    );
  }

  await Promise.allSettled(promises);
}

// ── New Deal Created ─────────────────────────────────────────────────────

export interface NotifyNewDealParams {
  spaceId: string;
  dealTitle: string;
  dealValue?: number | null;
  dealAddress?: string | null;
  dealPriority?: string | null;
  contactNames?: string[];
}

/**
 * Notify space owner about a new deal via email + SMS.
 * Respects both the channel toggles AND the notifyNewDeals event toggle.
 */
export async function notifyNewDeal(params: NotifyNewDealParams): Promise<void> {
  const info = await getSpaceOwnerInfo(params.spaceId);
  if (!info || !info.notifyNewDeals) return;

  const promises: Promise<unknown>[] = [];

  // Email notification
  if (info.emailEnabled) {
    promises.push(
      sendNewDealNotification({
        toEmail: info.ownerEmail,
        spaceName: info.spaceName,
        spaceSlug: info.spaceSlug,
        dealTitle: params.dealTitle,
        dealValue: params.dealValue,
        dealAddress: params.dealAddress,
        dealPriority: params.dealPriority,
        contactNames: params.contactNames,
      }).catch((err) => logger.error('[notify] deal email failed', { spaceId: params.spaceId }, err))
    );
  }

  // SMS notification
  if (info.smsEnabled && info.ownerPhone) {
    promises.push(
      sendSMS(
        newDealSMS({
          spaceName: info.spaceName,
          dealTitle: params.dealTitle,
          value: params.dealValue != null ? formatCompact(params.dealValue) : null,
          phone: info.ownerPhone,
        })
      ).catch((err) => logger.error('[notify] deal SMS failed', { spaceId: params.spaceId }, err))
    );
  }

  await Promise.allSettled(promises);
}

// ── New Contact (manually added) ─────────────────────────────────────────

export interface NotifyNewContactParams {
  spaceId: string;
  contactName: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  tags?: string[];
}

/**
 * Notify space owner about a manually added contact (new lead) via SMS.
 * Only fires if the contact is tagged as 'new-lead'.
 */
export async function notifyNewContact(params: NotifyNewContactParams): Promise<void> {
  // Only notify for contacts tagged as new leads
  if (!params.tags?.includes('new-lead')) return;

  const info = await getSpaceOwnerInfo(params.spaceId);
  if (!info || !info.notifyNewLeads) return;

  if (info.smsEnabled && info.ownerPhone) {
    try {
      await sendSMS(
        newLeadSMS({
          spaceName: info.spaceName,
          leadName: params.contactName,
          leadPhone: params.contactPhone,
          phone: info.ownerPhone,
        })
      );
    } catch (err) {
      logger.error('[notify] contact SMS failed', { spaceId: params.spaceId }, err);
    }
  }
}
