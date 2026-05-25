'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Flag } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const MAX_REASON_LEN = 2000;

export interface FlagForReviewButtonProps {
  dealId: string;
  /** Current open review if one exists — if truthy, the button changes
   *  to a disabled "Review pending" chip instead of the active flag
   *  button. Parent is responsible for fetching/passing this state. */
  hasOpenReview?: boolean;
  /** Called after a successful flag so the parent can refetch or update
   *  the deal's UI (e.g. re-enable this button when the review resolves). */
  onFlagged?: () => void;
  /** When the deal is NOT in a brokerage workspace, pass false to hide
   *  the affordance entirely. Parent knows (Space.brokerageId). */
  visible?: boolean;
}

type ReviewRequestError = { error?: string };

export function FlagForReviewButton({
  dealId,
  hasOpenReview = false,
  onFlagged,
  visible = true,
}: FlagForReviewButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  if (!visible) return null;

  if (hasOpenReview) {
    // Clickable — calls router.refresh() so the agent can pull the latest
    // server state. Without this, the chip stays "Review pending" even
    // after the broker resolves (server components re-render on navigation,
    // but the agent has no in-app reason to navigate and no real-time
    // subscription tells them to). Worst case: click does nothing visible
    // because the review is still open.
    return (
      <button
        type="button"
        onClick={() => router.refresh()}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50',
          'px-2.5 h-8 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors',
        )}
        title="Your broker is reviewing this deal. Click to check for updates."
      >
        <Flag size={13} className="text-muted-foreground" />
        Review pending
      </button>
    );
  }

  const trimmed = reason.trim();
  const reasonLen = reason.length;
  const canSubmit = trimmed.length >= 1 && reasonLen <= MAX_REASON_LEN && !submitting;

  function handleOpenChange(next: boolean) {
    if (submitting) return;
    setOpen(next);
    if (!next) {
      // reset state on close
      setReason('');
      setInlineError(null);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setInlineError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/review-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: trimmed }),
      });

      if (res.status === 201) {
        toast.success('Sent to your broker.');
        setOpen(false);
        setReason('');
        setInlineError(null);
        if (onFlagged) {
          onFlagged();
        } else {
          // Default: refresh the current route so server-fetched state
          // (e.g. hasOpenReview) updates and this button flips to the
          // "Review pending" chip.
          router.refresh();
        }
        return;
      }

      let body: ReviewRequestError = {};
      try {
        body = (await res.json()) as ReviewRequestError;
      } catch {
        // ignore json parse failures — fall through to generic error
      }
      const errMsg = body.error ?? "That tripped me up. Try again.";

      if (res.status === 409) {
        if (errMsg.includes('already has an open review')) {
          toast.message('Already flagged — your broker is reviewing.');
        } else {
          toast.error(errMsg);
        }
        setOpen(false);
        setReason('');
        setInlineError(null);
        return;
      }

      // 400 or anything else → inline error
      setInlineError(errMsg);
    } catch {
      setInlineError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs font-medium"
          aria-label="Flag this deal for broker review"
        >
          <Flag size={13} />
          Flag for review
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Flag this deal for broker review</DialogTitle>
            <DialogDescription>
              Write a short note for your broker. They&apos;ll see this on
              {' '}
              <span className="font-mono text-xs">/broker/reviews</span>
              {' '}
              and can comment, approve, or close the request.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <Label htmlFor="flag-reason">Why this deal needs review</Label>
            <Textarea
              id="flag-reason"
              value={reason}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
              placeholder="Briefly describe what you'd like your broker to look at…"
              rows={5}
              maxLength={MAX_REASON_LEN}
              required
              disabled={submitting}
              aria-invalid={inlineError ? true : undefined}
            />
            <div className="flex items-center justify-between">
              {inlineError ? (
                <p className="text-xs text-destructive" role="alert">
                  {inlineError}
                </p>
              ) : (
                <span />
              )}
              <p
                className={cn(
                  'text-xs tabular-nums',
                  reasonLen > MAX_REASON_LEN
                    ? 'text-destructive'
                    : 'text-muted-foreground',
                )}
              >
                {reasonLen} / {MAX_REASON_LEN}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? 'Sending…' : 'Send to broker'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
