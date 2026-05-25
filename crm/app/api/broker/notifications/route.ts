import { NextResponse } from 'next/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/broker/notifications
 * Returns the latest broker notifications.
 */
export async function GET() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: notifications } = await supabase
    .from('BrokerNotification')
    .select('*')
    .eq('brokerageId', ctx.brokerage.id)
    .order('createdAt', { ascending: false })
    .limit(20);

  return NextResponse.json({ notifications: notifications ?? [] });
}

/**
 * PATCH /api/broker/notifications
 * Mark all unread notifications as read.
 */
export async function PATCH() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await supabase
    .from('BrokerNotification')
    .update({ read: true })
    .eq('brokerageId', ctx.brokerage.id)
    .eq('read', false);

  return NextResponse.json({ success: true });
}
