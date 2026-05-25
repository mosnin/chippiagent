'use client';

import { useEffect, useState } from 'react';
import { X, MessageCircle } from 'lucide-react';

const STORAGE_KEY = 'chippi.tip.howItWorks.dismissedAt';

/**
 * One-time explainer that surfaces the agent's autonomous loop, since the UI
 * alone doesn't make it obvious that Chippi runs in the background. Shown on
 * first load of the today view; dismissed forever once acknowledged via
 * localStorage. Skipped during SSR to avoid hydration mismatch.
 */
export function HowChippiWorksTip() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(STORAGE_KEY);
      if (!dismissed) setHidden(false);
    } catch {
      // localStorage unavailable (private mode, SSR fallback) — just show it
      setHidden(false);
    }
  }, []);

  if (hidden) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // no-op
    }
    setHidden(true);
  }

  return (
    <div className="relative rounded-xl border border-border/70 bg-muted/30 px-4 py-3 pr-9 text-sm text-foreground/90">
      <div className="flex items-start gap-2.5">
        <MessageCircle size={14} className="text-orange-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-0.5 leading-relaxed">
          <p className="font-medium">How Chippi works</p>
          <p className="text-[13px] text-muted-foreground">
            Chippi sweeps your pipeline every 15 minutes and leaves drafts and
            questions here for your review. Ask anything below — chat replies in
            real time, the inbox fills in the background.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  );
}
