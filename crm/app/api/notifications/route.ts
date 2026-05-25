import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireSpaceOwner } from '@/lib/api-auth';
import {
  notificationForNewLeadsCount,
  notificationForUpcomingTour,
  notificationForFollowUpDue,
  notificationForWaitlist,
  notificationForToursNeedingFollowUp,
} from '@/lib/notification-voice';

/**
 * GET — Returns a list of actionable notifications for the dashboard.
 * These are computed in real-time from CRM data, not stored separately.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const authResult = await requireSpaceOwner(slug);
  if (authResult instanceof NextResponse) return authResult;
  const { space } = authResult;

  const now = new Date();
  const notifications: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    href: string;
    createdAt: string;
    priority: 'high' | 'medium' | 'low';
  }> = [];

  try {
    // 1. New unread leads
    const { count: newLeads } = await supabase
      .from('Contact')
      .select('*', { count: 'exact', head: true })
      .eq('spaceId', space.id)
      .is('brokerageId', null)
      .contains('tags', ['new-lead']);
    if (newLeads && newLeads > 0) {
      const copy = notificationForNewLeadsCount(newLeads);
      notifications.push({
        id: 'new-leads',
        type: 'new_lead',
        title: copy.title,
        description: copy.description,
        href: `/s/${slug}/leads`,
        createdAt: now.toISOString(),
        priority: 'high',
      });
    }

    // 2. Tours starting in the next 24 hours
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const { data: upcomingTours } = await supabase
      .from('Tour')
      .select('id, guestName, startsAt, propertyAddress')
      .eq('spaceId', space.id)
      .in('status', ['scheduled', 'confirmed'])
      .gte('startsAt', now.toISOString())
      .lte('startsAt', in24h.toISOString())
      .order('startsAt', { ascending: true })
      .limit(5);
    for (const t of upcomingTours ?? []) {
      const copy = notificationForUpcomingTour(
        t.guestName,
        new Date(t.startsAt),
        t.propertyAddress,
        now,
      );
      notifications.push({
        id: `tour-${t.id}`,
        type: 'upcoming_tour',
        title: copy.title,
        description: copy.description,
        href: `/s/${slug}/calendar`,
        createdAt: t.startsAt,
        priority: 'high',
      });
    }

    // 3. Follow-ups that are due
    const { data: dueFollowUps } = await supabase
      .from('Contact')
      .select('id, name, followUpAt')
      .eq('spaceId', space.id)
      .not('followUpAt', 'is', null)
      .lte('followUpAt', now.toISOString())
      .order('followUpAt', { ascending: true })
      .limit(5);
    for (const c of dueFollowUps ?? []) {
      const copy = notificationForFollowUpDue(c.name, new Date(c.followUpAt), now);
      notifications.push({
        id: `followup-${c.id}`,
        type: 'follow_up_due',
        title: copy.title,
        description: copy.description,
        href: `/s/${slug}/contacts/${c.id}`,
        createdAt: c.followUpAt,
        priority: 'medium',
      });
    }

    // 4. Waitlist entries needing attention
    const { count: waitlistCount } = await supabase
      .from('TourWaitlist')
      .select('*', { count: 'exact', head: true })
      .eq('spaceId', space.id)
      .eq('status', 'waiting');
    if (waitlistCount && waitlistCount > 0) {
      const copy = notificationForWaitlist(waitlistCount);
      notifications.push({
        id: 'waitlist',
        type: 'waitlist',
        title: copy.title,
        description: copy.description,
        href: `/s/${slug}/calendar`,
        createdAt: now.toISOString(),
        priority: 'low',
      });
    }

    // 5. Completed tours needing follow-up (no deal yet)
    const { data: completedNoFollowUp } = await supabase
      .from('Tour')
      .select('id, guestName, updatedAt')
      .eq('spaceId', space.id)
      .eq('status', 'completed')
      .order('updatedAt', { ascending: false })
      .limit(10);

    if (completedNoFollowUp?.length) {
      const tourIds = completedNoFollowUp.map((t: any) => t.id);
      const { data: dealsFromTours } = await supabase
        .from('Deal')
        .select('sourceTourId')
        .eq('spaceId', space.id)
        .in('sourceTourId', tourIds);
      const dealsSet = new Set((dealsFromTours ?? []).map((d: any) => d.sourceTourId));
      const needsAction = completedNoFollowUp.filter((t: any) => !dealsSet.has(t.id));
      if (needsAction.length > 0) {
        const copy = notificationForToursNeedingFollowUp(needsAction.length);
        notifications.push({
          id: 'tours-need-action',
          type: 'tour_needs_action',
          title: copy.title,
          description: copy.description,
          href: `/s/${slug}/calendar`,
          createdAt: now.toISOString(),
          priority: 'medium',
        });
      }
    }
  } catch (err) {
    console.error('[notifications] query failed', err);
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 });
  }

  // Sort: high priority first, then by date
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  notifications.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json(notifications);
}
