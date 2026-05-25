'use client';

import { useEffect, useRef } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type PostgresEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface UseRealtimeOptions<T extends Record<string, unknown>> {
  /** Database table to subscribe to */
  table: string;
  /** Postgres change event type */
  event?: PostgresEvent;
  /** Filter string, e.g. 'spaceId=eq.abc-123' */
  filter?: string;
  /** Callback when a change occurs */
  onEvent: (payload: RealtimePostgresChangesPayload<T>) => void;
  /** Whether the subscription is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Subscribe to Supabase Realtime Postgres changes.
 * Automatically manages channel lifecycle (subscribe on mount, unsubscribe on unmount).
 *
 * @example
 * useRealtime({
 *   table: 'Contact',
 *   event: 'INSERT',
 *   filter: `spaceId=eq.${spaceId}`,
 *   onEvent: (payload) => {
 *     console.log('New contact:', payload.new);
 *   },
 * });
 */
export function useRealtime<T extends Record<string, unknown> = Record<string, unknown>>(
  options: UseRealtimeOptions<T>,
) {
  const { table, event = '*', filter, onEvent, enabled = true } = options;
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    const channelName = `realtime:${table}:${event}:${filter ?? 'all'}`;

    const config: Record<string, unknown> = {
      event,
      schema: 'public',
      table,
    };
    if (filter) config.filter = filter;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as any,
        config as any,
        (payload: RealtimePostgresChangesPayload<T>) => {
          callbackRef.current(payload);
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [table, event, filter, enabled]);
}
