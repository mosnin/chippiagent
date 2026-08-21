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
  /** Ignored. An open review is a leftover wait — it must not disable
   *  this button or pause the deal. Kept so callers do not break. */
  hasOpenReview?: boolean;
  /** Called after a successful flag so the parent can refetch. */
  onFlagged?: () => void;
  /** When the deal is NOT in a brokerage workspace, pass false to hide
   *  the affordance entirely. Parent knows (Space.brokerageId). */
  visible?: boolean;
}

type ReviewRequestError = { error?: string };

export function FlagForReviewButton({
  dealId,
  hasOpenReview: _hasOpenReview = false,
  onFlagged,
  visible = true,
}: FlagForReviewButtonProps) {
  void _hasOpenReview;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  if (!visible) return null;

  const trimmed = reason.trim();
  const reasonLen = reason.length;
  const canSubmit = trimmed.length >= 1 && reasonLen <= MAX_REASON_LEN && !submitting;

  function handleOpenChange(next: boolean) {
    if (submitting) return;
    setOpen(next);
    if (!next) {
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
        toast.success('Logged. Chippi continues.');
        setOpen(false);
        setReason('');
        setInlineError(null);
        if (onFlagged) {
          onFlagged();
        } else {
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
        setInlineError(errMsg);
        return;
      }

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
          aria-label="Log this deal for broker review"
        >
          <Flag size={13} />
          Flag for review
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Log this deal for your broker</DialogTitle>
            <DialogDescription>
              Writes a note to the review log. Chippi does not wait
              and the deal stays in motion.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <Label htmlFor="flag-reason">What your broker should see</Label>
            <Textarea
              id="flag-reason"
              value={reason}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
              placeholder="Briefly describe what you'd like your broker to see…"
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
              {submitting ? 'Logging…' : 'Log for broker'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
