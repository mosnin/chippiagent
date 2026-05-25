'use client';

/**
 * ChippiActivityToast — the cockpit's live readout for autonomous runs.
 *
 * Polls /api/agent/active-runs every few seconds; when an autonomous run
 * appears, opens an SSE stream to /api/agent/stream and surfaces the
 * agent's current tool call in a compact pill at the bottom-right of the
 * viewport. Auto-dismisses a few seconds after the run completes.
 *
 * Pairs with the sidebar ChippiInstrument: the instrument is the persistent
 * status indicator (working / idle / paused), this is the live narration
 * ("Chippi · find_contacts…") that appears only while a run is in flight.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type StreamEventType =
  | 'connected'
  | 'info'
  | 'action'
  | 'draft'
  | 'complete'
  | 'error'
  | 'timeout'
  | 'keepalive';

interface StreamEvent {
  type: StreamEventType;
  message: string;
  metadata?: { tool?: string; phase?: string };
  ts: number;
}

interface ActiveRunsResponse {
  runs: { runId: string; startedAt: number }[];
}

const POLL_INTERVAL_MS = 4_000;
const DISMISS_DELAY_MS = 3_500;

export function ChippiActivityToast() {
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [latest, setLatest] = useState<StreamEvent | null>(null);
  const [done, setDone] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const pollOnce = useCallback(async () => {
    if (activeRunId) return; // already tracking one
    try {
      const res = await fetch('/api/agent/active-runs');
      if (!res.ok) return;
      const data = (await res.json()) as ActiveRunsResponse;
      if (data.runs.length > 0) setActiveRunId(data.runs[0].runId);
    } catch {
      // ignore — try again next poll
    }
  }, [activeRunId]);

  // Poll for active runs while we're not tracking one.
  useEffect(() => {
    void pollOnce();
    const interval = setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pollOnce]);

  // Subscribe to the live event stream for the active run.
  useEffect(() => {
    if (!activeRunId) return;
    setDone(false);
    setLatest(null);

    const es = new EventSource(`/api/agent/stream?runId=${encodeURIComponent(activeRunId)}`);
    esRef.current = es;

    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data) as StreamEvent;
        if (parsed.type === 'keepalive' || parsed.type === 'connected') return;
        setLatest(parsed);
        if (parsed.type === 'complete' || parsed.type === 'error' || parsed.type === 'timeout') {
          setDone(true);
          es.close();
        }
      } catch {
        // ignore malformed events
      }
    };
    es.onerror = () => {
      es.close();
      setDone(true);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [activeRunId]);

  // Auto-dismiss after the run terminates.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => {
      setActiveRunId(null);
      setLatest(null);
      setDone(false);
    }, DISMISS_DELAY_MS);
    return () => clearTimeout(t);
  }, [done]);

  const shouldShow = activeRunId !== null && latest !== null;
  const label = (() => {
    if (!latest) return '';
    if (done && latest.type === 'error') return 'Chippi · run failed';
    if (done) return 'Chippi · done';
    if (latest.metadata?.tool && latest.metadata.phase === 'start') {
      return `Chippi · ${latest.metadata.tool}…`;
    }
    if (latest.metadata?.tool && latest.metadata.phase === 'complete') {
      return `Chippi · ${latest.metadata.tool} done`;
    }
    return `Chippi · ${latest.message}`;
  })();

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8, transition: { duration: 0.2 } }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-4 right-4 z-40 max-w-[18rem] pointer-events-none"
          aria-live="polite"
        >
          <div
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-full',
              'bg-foreground text-background shadow-lg shadow-foreground/10',
              'text-xs font-medium',
            )}
          >
            {done ? (
              <span
                aria-hidden
                className={cn(
                  'w-1.5 h-1.5 rounded-full flex-shrink-0',
                  latest?.type === 'error' ? 'bg-amber-400' : 'bg-emerald-400',
                )}
              />
            ) : (
              <Loader2 size={12} className="animate-spin flex-shrink-0" />
            )}
            <span className="truncate">{label}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
