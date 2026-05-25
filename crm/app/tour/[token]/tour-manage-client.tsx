'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { PostTourFeedback } from '@/components/tours/post-tour-feedback';
import {
  BODY,
  BODY_MUTED,
  CAPTION,
  GHOST_PILL,
  PRIMARY_PILL,
  TITLE_FONT,
} from '@/lib/typography';

interface TourData {
  id: string;
  guestName: string;
  guestEmail: string;
  propertyAddress: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
}

interface TourManageClientProps {
  tour: TourData;
  token: string;
  businessName: string;
  bookingSlug: string;
}

// Sanctioned status tones — pulled from the design language. Default is the
// muted neutral pill; confirmed and cancelled get explicit colour signals.
const STATUS_TONE: Record<string, { label: string; className: string }> = {
  scheduled: {
    label: 'Scheduled',
    className: 'bg-foreground/[0.06] text-muted-foreground',
  },
  confirmed: {
    label: 'Confirmed',
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  completed: {
    label: 'Completed',
    className: 'bg-foreground/[0.06] text-muted-foreground',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  },
};

export function TourManageClient({ tour, token, businessName, bookingSlug }: TourManageClientProps) {
  const [status, setStatus] = useState(tour.status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isCancelled = status === 'cancelled';
  const isPast = new Date(tour.startsAt) < new Date();
  const isCompleted = status === 'completed';
  const canCancel = !isCancelled && !isPast && !isCompleted;
  const canRebook = (isCancelled || isPast) && bookingSlug;

  async function cancelTour() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/tours/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'cancel' }),
      });
      if (res.ok) {
        setStatus('cancelled');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to cancel. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  }

  const start = new Date(tour.startsAt);
  const end = new Date(tour.endsAt);
  const duration = Math.round((end.getTime() - start.getTime()) / 60000);

  const dateLabel = start.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const timeLabel = `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

  const tone = STATUS_TONE[status] ?? STATUS_TONE.scheduled;

  // After cancellation: calm, serif, no chunky chrome.
  if (isCancelled) {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-xl bg-background border border-border/70 p-6 text-center space-y-4">
          <h1
            className="text-3xl tracking-tight text-foreground"
            style={TITLE_FONT}
          >
            Cancelled.
          </h1>
          <p className={cn(BODY_MUTED, 'max-w-sm mx-auto')}>
            Your tour with {businessName} has been cancelled. You can book a new
            time below.
          </p>
          {canRebook && (
            <div className="pt-2">
              <a
                href={`/book/${bookingSlug}`}
                className={cn(PRIMARY_PILL, 'justify-center')}
              >
                Book a new tour
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-xl bg-background border border-border/70 p-6">
        {/* ─── Heading ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1
              className="text-3xl tracking-tight text-foreground"
              style={TITLE_FONT}
            >
              Your tour
            </h1>
            <p className={cn(BODY_MUTED, 'mt-1')}>with {businessName}</p>
          </div>
          <span
            className={cn(
              'rounded-md px-2 py-0.5 text-xs flex-shrink-0 mt-1',
              tone.className,
            )}
          >
            {tone.label}
          </span>
        </div>

        {/* ─── Tour summary — hairline-divided rows ──────────────── */}
        <div className="border-t border-border/60 mt-6 pt-2 divide-y divide-border/60">
          <SummaryRow label="Guest" value={tour.guestName} />
          <SummaryRow label="Date" value={dateLabel} />
          <SummaryRow label="Time" value={`${timeLabel} (${duration} min)`} />
          {tour.propertyAddress && (
            <SummaryRow label="Property" value={tour.propertyAddress} />
          )}
        </div>

        {/* ─── Post-tour feedback (only on completed) ────────────── */}
        {isCompleted && (
          <div className="mt-8">
            <PostTourFeedback
              token={token}
              guestName={tour.guestName}
              businessName={businessName}
            />
          </div>
        )}

        {/* ─── Error ─────────────────────────────────────────────── */}
        {error && (
          <p className="text-xs text-rose-600 dark:text-rose-400 mt-4">
            {error}
          </p>
        )}

        {/* ─── Actions ───────────────────────────────────────────── */}
        {(canCancel || canRebook) && (
          <div className="border-t border-border/60 mt-8 pt-6 flex items-center justify-between gap-3">
            <p className={CAPTION}>
              Need help? Contact {businessName} directly.
            </p>
            {canCancel && (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={loading}
                className={cn(GHOST_PILL, 'disabled:opacity-60')}
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                Cancel tour
              </button>
            )}
            {canRebook && (
              <a
                href={`/book/${bookingSlug}`}
                className={cn(PRIMARY_PILL, 'justify-center')}
              >
                Book a new tour
              </a>
            )}
          </div>
        )}

        {!canCancel && !canRebook && (
          <p className={cn(CAPTION, 'mt-8 text-center')}>
            Need help? Contact {businessName} directly.
          </p>
        )}
      </div>

      {/* ─── Cancel confirmation ──────────────────────────────────── */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle
              className="text-2xl tracking-tight font-normal text-foreground"
              style={TITLE_FONT}
            >
              Cancel this tour?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This releases your time slot. {businessName} will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className={cn(GHOST_PILL, 'border-0 shadow-none')}
              disabled={loading}
            >
              Keep tour
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                cancelTour();
              }}
              disabled={loading}
              className={cn(
                PRIMARY_PILL,
                'bg-rose-600 text-white hover:bg-rose-600/90 disabled:opacity-60',
              )}
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Cancel tour
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <span className={CAPTION}>{label}</span>
      <span className={cn(BODY, 'text-right')}>{value}</span>
    </div>
  );
}
