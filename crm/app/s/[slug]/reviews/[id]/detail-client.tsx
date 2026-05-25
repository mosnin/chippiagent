'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { formatRelative, type ReviewStatus } from '../reviews-client';

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

export interface ReviewDetail {
  id: string;
  dealId: string;
  status: ReviewStatus;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedNote: string | null;
  deal: {
    id: string;
    title: string | null;
    value: number | null;
  };
  resolvedByUser: { id: string; name: string | null } | null;
  viewerUserId: string;
}

interface Props {
  slug: string;
  review: ReviewDetail;
  comments: ReviewComment[];
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

// ── Component ────────────────────────────────────────────────────────────────

const MAX_COMMENT_LEN = 2000;

export function DetailClient({ slug, review, comments: initialComments }: Props) {
  const [comments, setComments] = useState<ReviewComment[]>(initialComments);
  const [commentBody, setCommentBody] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const isResolved = review.status !== 'open';
  const dealHref = `/s/${slug}/deals/${review.deal.id}`;
  const resolvedByName = review.resolvedByUser?.name ?? 'your broker';

  // POST comments through the existing broker route — its dual-auth permits
  // the requesting agent (verified in /api/broker/reviews/[id]/comments). We
  // do NOT add a new comments route; re-using the existing one guarantees
  // the broker and realtor threads stay in sync.
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
      if (!res.ok) {
        // Server now rejects posts to resolved reviews with 409 (audit
        // follow-up). Surface the specific reason so the realtor knows
        // to refresh rather than retry blindly.
        if (res.status === 409) {
          toast.error('This review was just resolved. Refresh to see your broker\'s decision.');
          return;
        }
        throw new Error(`Failed to post comment (${res.status})`);
      }
      const created = (await res.json()) as ReviewComment;
      setComments((prev) => [...prev, created]);
      setCommentBody('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't post that comment. Try again.";
      toast.error(msg);
    } finally {
      setPostingComment(false);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Breadcrumb */}
      <div>
        <Link
          href={`/s/${slug}/reviews`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          My reviews
        </Link>
      </div>

      {/* Review card */}
      <Card>
        <CardContent className="px-5 py-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <Link
                href={dealHref}
                className="text-lg font-semibold text-primary hover:underline underline-offset-2"
              >
                {review.deal.title ?? 'Untitled deal'}
              </Link>
              <p className="text-sm text-muted-foreground">
                Flagged {formatRelative(review.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className={`inline-flex text-xs font-medium rounded-full px-2.5 py-0.5 ${statusBadgeClass(review.status)}`}
              >
                {statusLabel(review.status)}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <p className="text-sm whitespace-pre-wrap break-words">{review.reason}</p>
          </div>
        </CardContent>
      </Card>

      {/* Resolution panel — prominent when resolved, hidden when open. */}
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
              <p className="text-sm mt-2 whitespace-pre-wrap break-words">
                {review.resolvedNote}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Comment thread — realtor's own comments included, no gating. */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Comments</h2>
        {comments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No comments yet.</p>
        ) : (
          <div className="space-y-2">
            {comments.map((c) => {
              const isSelf = c.authorUser.id === review.viewerUserId;
              const authorName = isSelf
                ? 'You'
                : c.authorUser.name ?? 'Unknown';
              const ci = initialsOf(isSelf ? authorName : c.authorUser.name);
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
                        <p className="text-sm mt-1 whitespace-pre-wrap break-words">
                          {c.body}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer — hidden once resolved. The server-side POST still
          accepts comments on resolved reviews (current contract), but the
          product rule here is: no more back-and-forth after resolution. */}
      {!isResolved && (
        <Card>
          <CardContent className="px-4 py-3 space-y-2">
            <Textarea
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value.slice(0, MAX_COMMENT_LEN))}
              placeholder="Reply to your broker…"
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
                Send
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
