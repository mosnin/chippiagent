'use client';

/**
 * ChippiPowerToggle — the muzzle. A header control that shows whether the
 * autonomous agent is running and lets the realtor stop it in one tap.
 *
 * Wired to the existing /api/agent/settings endpoint (the `enabled` flag) —
 * no new schema, no change to the agent runtime's approval logic. Pausing
 * is consequential, so it goes through a confirm; resuming is one tap.
 *
 * State language:
 *   - running → a quiet green dot. Normal state, doesn't shout.
 *   - paused  → an amber pill that reads "Paused". Abnormal state, worth
 *               noticing every time the realtor glances at the header.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function ChippiPowerToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmPause, setConfirmPause] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/agent/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { enabled?: boolean } | null) => {
        if (!cancelled && data) setEnabled(Boolean(data.enabled));
      })
      .catch(() => {
        // Silent — the control just doesn't render until we know the state.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: boolean) => {
    setSaving(true);
    try {
      const res = await fetch('/api/agent/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        toast.error("Couldn't change Chippi's status. Try again.");
        return;
      }
      const data = (await res.json()) as { enabled: boolean };
      setEnabled(data.enabled);
      toast.success(data.enabled ? 'Chippi is running.' : 'Chippi is paused. It won’t act until you resume it.');
    } catch {
      toast.error("Couldn't reach Chippi. Try again.");
    } finally {
      setSaving(false);
    }
  }, []);

  // Don't render until we know the state — avoids a flash of the wrong label.
  if (enabled === null) return null;

  const handleClick = () => {
    if (saving) return;
    if (enabled) {
      setConfirmPause(true); // pausing is consequential — confirm first
    } else {
      void persist(true); // resuming is one tap
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={saving}
        title={enabled ? 'Chippi is running — click to pause' : 'Chippi is paused — click to resume'}
        aria-label={enabled ? 'Pause Chippi' : 'Resume Chippi'}
        className={cn(
          'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50',
          enabled
            ? 'text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.025]'
            : 'bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25',
        )}
      >
        {saving ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <span
            aria-hidden
            className={cn(
              'w-1.5 h-1.5 rounded-full flex-shrink-0',
              enabled ? 'bg-emerald-500' : 'bg-amber-500',
            )}
          />
        )}
        <span className="hidden sm:inline">{enabled ? 'Chippi on' : 'Paused'}</span>
      </button>

      <AlertDialog open={confirmPause} onOpenChange={setConfirmPause}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause Chippi?</AlertDialogTitle>
            <AlertDialogDescription>
              Chippi stops acting on its own — no drafts, no follow-ups, no
              automated work. Anything already waiting for your approval stays
              put. You can resume from the header anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep running</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmPause(false);
                void persist(false);
              }}
            >
              Pause Chippi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
