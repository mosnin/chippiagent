'use client';

/**
 * ChippiInstrument — the cockpit readout in the sidebar rail.
 *
 * Pairs with the header kill switch: the header is the *control* (pause /
 * resume), this is the *instrument* (what's the agent doing right now).
 * Three honest states, all from existing endpoints — no protected systems:
 *
 *   - paused   → agent is off (`/api/agent/settings` enabled=false)
 *   - working  → enabled + did something in the last 5 min (pulsing dot)
 *   - idle     → enabled, but quiet right now (steady dot)
 *
 * Motion rule: the dot pulses ONLY in the working state — motion means the
 * machine is running, nothing more. Polls on focus + every 30s so the
 * readout stays live without being chatty.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';

type AgentState = 'paused' | 'working' | 'idle';

const WORKING_WINDOW_MS = 5 * 60 * 1000;

export function ChippiInstrument({ collapsed = false }: { collapsed?: boolean }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [settingsRes, activityRes] = await Promise.all([
        fetch('/api/agent/settings'),
        fetch('/api/agent/activity?limit=1'),
      ]);
      if (settingsRes.ok) {
        const s = (await settingsRes.json()) as { enabled?: boolean };
        setEnabled(Boolean(s.enabled));
      }
      if (activityRes.ok) {
        const a = await activityRes.json();
        setLastRunAt(Array.isArray(a) ? (a[0]?.createdAt ?? null) : null);
      }
    } catch {
      // Silent — the instrument keeps its last known reading.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    const interval = setInterval(() => void refresh(), 30_000);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [refresh]);

  // Don't render until we have a reading — no flash of a wrong state.
  if (enabled === null) return null;

  const recentlyActive =
    lastRunAt != null && Date.now() - new Date(lastRunAt).getTime() < WORKING_WINDOW_MS;
  const state: AgentState = !enabled ? 'paused' : recentlyActive ? 'working' : 'idle';

  const dotClass =
    state === 'paused'
      ? 'bg-amber-500'
      : state === 'working'
        ? 'bg-emerald-500'
        : 'bg-emerald-500/60';

  const label =
    state === 'paused' ? 'Paused' : state === 'working' ? 'Working' : 'Idle';

  const sub =
    state === 'paused'
      ? 'Resume from the header'
      : lastRunAt
        ? `Last active ${timeAgo(lastRunAt)}`
        : 'Standing by';

  // The dot — pulses only in the working state.
  const Dot = (
    <span className="relative flex h-2 w-2 flex-shrink-0">
      {state === 'working' && (
        <motion.span
          aria-hidden
          className="absolute inline-flex h-full w-full rounded-full bg-emerald-500"
          initial={{ opacity: 0.5, scale: 1 }}
          animate={{ opacity: 0, scale: 2.4 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', dotClass)} />
    </span>
  );

  if (collapsed) {
    return (
      <div
        className="flex justify-center py-2"
        title={`Chippi · ${label}`}
        aria-label={`Chippi ${label}`}
      >
        {Dot}
      </div>
    );
  }

  return (
    <div className="mx-3 mt-3 rounded-lg border border-border/60 bg-background/40 px-2.5 py-2">
      <div className="flex items-center gap-2">
        {Dot}
        <span className="text-[12px] font-medium text-foreground">Chippi</span>
        <span
          className={cn(
            'ml-auto text-[10px] font-semibold uppercase tracking-wider',
            state === 'paused'
              ? 'text-amber-600 dark:text-amber-400'
              : state === 'working'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-muted-foreground',
          )}
        >
          {label}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums pl-4">{sub}</p>
    </div>
  );
}
