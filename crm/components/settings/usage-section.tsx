'use client';

/**
 * Usage — how much of Chippi's daily budget is spent.
 *
 * One bar, one percentage. The realtor doesn't need a cost breakdown to
 * answer the only question they actually have: "do I have room left
 * today?" Everything else was noise.
 *
 * Reads /api/agent/usage — today's token count against the daily budget.
 */

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { BODY_MUTED, CAPTION, STAT_NUMBER, TITLE_FONT } from '@/lib/typography';

interface UsageData {
  used: number;
  limit: number;
  pct: number;
  resetsAt: string;
}

function resetLine(resetsAt: string): string {
  const ms = new Date(resetsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'Resets soon.';
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return 'Resets within the hour.';
  if (hours === 1) return 'Resets in 1 hour.';
  return `Resets in ${hours} hours.`;
}

export function UsageSection() {
  const [data, setData] = useState<UsageData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/agent/usage');
        if (!res.ok) throw new Error('usage fetch failed');
        const json = (await res.json()) as UsageData;
        if (active) {
          setData(json);
          setState('ready');
        }
      } catch {
        if (active) setState('error');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const pct = data ? Math.max(0, Math.min(100, Math.round(data.pct))) : 0;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-base font-semibold">Usage</h2>
        <p className={BODY_MUTED}>How much of Chippi&apos;s daily budget is spent.</p>
      </header>

      {state === 'loading' && <p className={CAPTION}>Checking usage…</p>}

      {state === 'error' && (
        <p className={CAPTION}>Couldn&apos;t load usage right now — usually temporary.</p>
      )}

      {state === 'ready' && data && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className={STAT_NUMBER} style={TITLE_FONT}>
              {pct}%
            </p>
            <p className={CAPTION}>{resetLine(data.resetsAt)}</p>
          </div>

          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Daily budget used"
          >
            <div
              className="h-full rounded-full bg-foreground"
              style={{ width: `${pct}%` }}
            />
          </div>

          <p className={cn(CAPTION, 'tabular-nums')}>
            {data.used.toLocaleString()} of {data.limit.toLocaleString()} tokens used today.
          </p>
        </div>
      )}
    </div>
  );
}
