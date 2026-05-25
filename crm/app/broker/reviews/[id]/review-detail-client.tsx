'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import type { ReviewRow, ReviewStatus } from '../reviews-client';
import { formatRelative } from '../reviews-client';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReviewComment {
  id: string;
  authorUser: {
    id: string;
    name: string | null;
  };
  body: string;
  createdAt: string;
}

export type ReviewDetail = ReviewRow & {
  resolvedByUser: { id: string; name: string | null } | null;
};

interface Props {
  review: ReviewDetail;
  comments: ReviewComment[];
  role: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function initialsOf(name: string | null, fallback = '?'): string {
  const src = (name && name.trim()) || fallback;
  return (
    src
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

const statusBadgeClass = (status: ReviewStatus): string => {
  switch (status) {
    case 'open':
      return 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15';
    case 'approved':
      return 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15';
    case 'closed':
    default:
      return 'text-muted-foreground bg-muted';
  }
};

const statusLabel = (status: ReviewStatus): string =>
  status === 'open' ? 'Open' : status === 'approved' ? 'Approved' : 'Closed';

function absoluteDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Component ────────────────────────────────────────────────────────────────

const MAX_COMMENT_LEN = 2000;

export function ReviewDetailClient({ review: initialReview, comments: initialComments, role }: Props) {
  const [review, setReview] = useState<ReviewDetail>(initialReview);
  const [comments, setComments] = useState<ReviewComment[]>(initialComments);
  const [commentBody, setCommentBody] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [resolvedNote, setResolvedNote] = useState('');
  const [pendingAction, setPendingAction] = useState<null | 'approved' | 'closed'>(null);
  const [noteOpenFor, setNoteOpenFor] = useState<null | 'approved' | 'closed'>(null);

  const canResolve = role === 'broker_owner' || role === 'broker_admin';
  const isResolved = review.status !== 'open';

  const dealHref =
    review.deal.spaceSlug && review.deal.id
      ? `/s/${review.deal.spaceSlug}/deals/${review.deal.id}`
      : null;

  // Submit a new comment — optimistically append on success.
  const submitComment = async () => {
    const body = commentBody.trim();
    if (!body) return;
    if (body.length > MAX_COMMENT_LEN) {
      toast.error(`Comment is too long (max ${MAX_COMMENT_LEN} characters).`);
      return;
    }
    setPostingComment(true);
    try {
      const res = await fetch(`/api/broker/reviews/${review.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error(`Failed to post comment (${res.status})`);
      const created = (await res.json()) as ReviewComment;
      setComments((prev) => [...prev, created]);
      setCommentBody('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to post comment';
      toast.error(msg);
    } finally {
      setPostingComment(false);
    }
  };

  // Approve or close. Optional resolvedNote carries the broker's reasoning.
  const submitResolution = async (status: 'approved' | 'closed') => {
    setPendingAction(status);
    try {
      const payload: { status: 'approved' | 'closed'; resolvedNote?: string } = { status };
      const trimmed = resolvedNote.trim();
      if (trimmed) payload.resolvedNote = trimmed;

      const res = await fetch(`/api/broker/reviews/${review.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Failed to update review (${res.status})`);
      const updated = (await res.json()) as ReviewDetail;
      // Merge API response into local state — preserve joined fields the API
      // may not echo back (deal, requestingUser) using the existing review.
      setReview((prev) => ({
        ...prev,
        ...updated,
        deal: updated.deal ?? prev.deal,
        requestingUser: updated.requestingUser ?? prev.requestingUser,
        resolvedByUser: updated.resolvedByUser ?? prev.resolvedByUser,
      }));
      setNoteOpenFor(null);
      setResolvedNote('');
      toast.success(status === 'approved' ? 'Review approved.' : 'Review closed.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update review';
      toast.error(msg);
    } finally {
      setPendingAction(null);
    }
  };

  const agentName =
    review.requestingUser.name ?? review.requestingUser.email ?? 'Unknown agent';
  const agentInitials = initialsOf(review.requestingUser.name ?? review.requestingUser.email);
  const resolvedByName = review.resolvedByUser?.name ?? 'a broker';

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Breadcrumb */}
      <div>
        <Link
          href="/broker/reviews"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          All reviews
        </Link>
      </div>

      {/* Review card */}
      <Card>
        <CardContent className="px-5 py-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              {dealHref ? (
                <Link
                  href={dealHref}
                  className="text-lg font-semibold text-primary hover:underline underline-offset-2"
                >
                  {review.deal.title ?? 'Untitled deal'}
                </Link>
              ) : (
                <p className="text-lg font-semibold">{review.deal.title ?? 'Untitled deal'}</p>
              )}
              <p className="text-sm text-muted-foreground">
                Flagged by <span className="font-medium text-foreground">{agentName}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className={`inline-flex text-xs font-medium rounded-full px-2.5 py-0.5 ${statusBadgeClass(review.status)}`}
              >
                {statusLabel(review.status)}
              </span>
              <span className="text-xs text-muted-foreground">
                Flagged {absoluteDate(review.createdAt)}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <p className="text-sm whitespace-pre-wrap break-words">{review.reason}</p>
          </div>
        </CardContent>
      </Card>

      {/* Resolved panel (muted) — only when already resolved */}
      {isResolved && (
        <Card className="border-dashed">
          <CardContent className="px-5 py-4 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {review.status === 'approved' ? 'Approved' : 'Closed'}
            </p>
            <p className="text-sm text-muted-foreground">
              by <span className="font-medium text-foreground">{resolvedByName}</span>
              {review.resolvedAt && <> · {formatRelative(review.resolvedAt)}</>}
            </p>
            {review.resolvedNote && (
              <p className="text-sm mt-2 whitespace-pre-wrap break-words">{review.resolvedNote}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Comment thread */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Comments</h2>
        {comments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No comments yet.</p>
        ) : (
          <div className="space-y-2">
            {comments.map((c) => {
              const authorName = c.authorUser.name ?? 'Unknown';
              const ci = initialsOf(c.authorUser.name);
              return (
                <Card key={c.id}>
                  <CardContent className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-semibold text-primary flex-shrink-0">
                        {ci}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <p className="text-sm font-semibold truncate">{authorName}</p>
                          <span className="text-xs text-muted-foreground">
                            {formatRelative(c.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm mt-1 whitespace-pre-wrap break-words">{c.body}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer */}
      <Card>
        <CardContent className="px-4 py-3 space-y-2">
          <Textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value.slice(0, MAX_COMMENT_LEN))}
            placeholder="Add a comment…"
            maxLength={MAX_COMMENT_LEN}
            aria-label="New comment"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {commentBody.length}/{MAX_COMMENT_LEN}
            </span>
            <Button
              size="sm"
              onClick={submitComment}
              disabled={postingComment || commentBody.trim().length === 0}
            >
              {postingComment && <Loader2 size={12} className="animate-spin" />}
              Add comment
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resolution actions — only broker_owner / broker_admin, only while open */}
      {canResolve && !isResolved && (
        <Card>
          <CardContent className="px-4 py-3 space-y-3">
            <p className="text-sm font-semibold">Resolve this review</p>

            {noteOpenFor && (
              <Textarea
                value={resolvedNote}
                onChange={(e) => setResolvedNote(e.target.value.slice(0, MAX_COMMENT_LEN))}
                placeholder={
                  noteOpenFor === 'approved'
                    ? 'Optional: add a note explaining your approval…'
                    : 'Optional: add a note explaining why you are closing this…'
                }
                maxLength={MAX_COMMENT_LEN}
                aria-label="Resolution note"
              />
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => {
                  if (noteOpenFor === 'approved') {
                    submitResolution('approved');
                  } else {
                    setNoteOpenFor('approved');
                  }
                }}
                disabled={pendingAction !== null}
                className="bg-emerald-600 hover:bg-emerald-700 text-white focus-visible:ring-emerald-600/40"
                aria-label="Approve review"
              >
                {pendingAction === 'approved' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                {noteOpenFor === 'approved' ? 'Confirm approve' : 'Approve'}
              </Button>

              <Button
                variant="ghost"
                onClick={() => {
                  if (noteOpenFor === 'closed') {
                    submitResolution('closed');
                  } else {
                    setNoteOpenFor('closed');
                  }
                }}
                disabled={pendingAction !== null}
                aria-label="Close review without action"
              >
                {pendingAction === 'closed' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <XCircle size={14} />
                )}
                {noteOpenFor === 'closed' ? 'Confirm close' : 'Close without action'}
              </Button>

              {noteOpenFor && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNoteOpenFor(null);
                    setResolvedNote('');
                  }}
                  disabled={pendingAction !== null}
                >
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
