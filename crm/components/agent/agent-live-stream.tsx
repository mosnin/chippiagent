'use client';

/**
 * AgentLiveStream — shows the agent's real-time task narration.
 *
 * Connects to GET /api/agent/stream?runId=... via Server-Sent Events
 * and renders each event as it arrives, like watching Claude Code run.
 *
 * Usage: mount when a run starts, unmount when 'complete' event arrives.
 */

import { useEffect, useRef, useState } from 'react';
import { Bot, CheckCircle2, AlertCircle, Zap, Info, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface StreamEvent {
  type: 'connected' | 'info' | 'action' | 'draft' | 'complete' | 'error' | 'timeout' | 'keepalive';
  message: string;
  agentType?: string;
  metadata?: Record<string, unknown>;
  ts: number;
}

interface Props {
  runId: string;
  onClose?: () => void;
}

const EVENT_CONFIG: Record<string, { icon: React.ElementType; className: string }> = {
  connected: { icon: Bot, className: 'text-muted-foreground' },
  info: { icon: Info, className: 'text-blue-500' },
  action: { icon: Zap, className: 'text-emerald-500' },
  draft: { icon: CheckCircle2, className: 'text-amber-500' },
  complete: { icon: CheckCircle2, className: 'text-emerald-600' },
  error: { icon: AlertCircle, className: 'text-destructive' },
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function AgentLiveStream({ runId, onClose }: Props) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/agent/stream?runId=${encodeURIComponent(runId)}`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const event: StreamEvent = JSON.parse(e.data);
        if (event.type === 'keepalive') return;

        setEvents((prev) => [...prev, event]);

        if (event.type === 'complete' || event.type === 'timeout') {
          setDone(true);
          es.close();
        }
        if (event.type === 'error') {
          setDone(true);
          es.close();
        }
      } catch {
        // malformed event — skip
      }
    };

    es.onerror = () => {
      setError('Connection lost');
      setDone(true);
      es.close();
    };

    return () => {
      es.close();
    };
  }, [runId]);

  // Auto-scroll to bottom as new events arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  return (
    <div className="rounded-lg border border-border/70 bg-card overflow-hidden flex flex-col max-h-[420px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30 flex-shrink-0">
        <div className="flex items-center gap-2">
          {done ? (
            <CheckCircle2 size={13} className="text-emerald-500" />
          ) : (
            <Loader2 size={13} className="text-primary animate-spin" />
          )}
          <span className="text-xs font-semibold">
            {done ? 'Run complete' : 'Agent running…'}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">{runId.slice(0, 8)}</span>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
            <X size={13} />
          </Button>
        )}
      </div>

      {/* Event log — styled like a terminal */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5 font-mono text-xs bg-[hsl(var(--muted)/0.2)]">
        {events.map((event, i) => {
          const cfg = EVENT_CONFIG[event.type] ?? EVENT_CONFIG.info;
          const Icon = cfg.icon;
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[10px] text-muted-foreground/60 flex-shrink-0 mt-0.5 w-16 tabular-nums">
                {formatTime(event.ts)}
              </span>
              <Icon size={11} className={cn('flex-shrink-0 mt-0.5', cfg.className)} />
              <span className={cn(
                'leading-relaxed break-words min-w-0',
                event.type === 'complete' ? 'text-emerald-600 font-semibold' : '',
                event.type === 'error' ? 'text-destructive' : 'text-foreground/90',
                event.type === 'draft' ? 'text-amber-600' : '',
              )}>
                {event.message}
              </span>
            </div>
          );
        })}

        {!done && events.length === 0 && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 size={11} className="animate-spin" />
            Connecting…
          </div>
        )}

        {error && (
          <p className="text-destructive flex items-center gap-1.5">
            <AlertCircle size={11} />
            {error}
          </p>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
