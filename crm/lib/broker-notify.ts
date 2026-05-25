/**
 * Helper to create broker notifications.
 * Non-blocking — failures are logged but never throw.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export type BrokerNotificationType =
  | 'member_joined'
  | 'member_removed'
  | 'deal_won'
  | 'deal_created'
  | 'lead_hot'
  | 'review_requested';

export interface NotifyBrokerParams {
  brokerageId: string;
  type: BrokerNotificationType;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

export async function notifyBroker(params: NotifyBrokerParams): Promise<void> {
  const { brokerageId, type, title, body, metadata } = params;

  try {
    await supabase.from('BrokerNotification').insert({
      id: crypto.randomUUID(),
      brokerageId,
      type,
      title,
      body: body ?? null,
      metadata: metadata ?? null,
      read: false,
    });
  } catch (err) {
    logger.error('[broker-notify] failed to create notification', { type, brokerageId }, err);
  }
}
