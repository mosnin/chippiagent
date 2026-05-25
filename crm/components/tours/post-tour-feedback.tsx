'use client';

import { useState } from 'react';
import { Star, Send, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface PostTourFeedbackProps {
  token: string;
  guestName: string;
  businessName: string;
}

export function PostTourFeedback({ token, guestName, businessName }: PostTourFeedbackProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function submitFeedback() {
    if (!rating) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/tours/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, rating, comment: comment.trim() || null }),
      });
      if (res.ok || res.status === 409) {
        setSubmitted(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't send that feedback. Try again.");
      }
    } catch {
      setError("I lost the connection. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center space-y-3">
        <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
        <h3 className="text-lg font-semibold">Thank you, {guestName}!</h3>
        <p className="text-sm text-muted-foreground">Your feedback helps {businessName} improve.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="text-center space-y-1">
        <h3 className="text-lg font-semibold">How was your tour?</h3>
        <p className="text-sm text-muted-foreground">Rate your experience with {businessName}</p>
      </div>

      {/* Star rating */}
      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHoveredRating(n)}
            onMouseLeave={() => setHoveredRating(0)}
            className="p-1 transition-transform hover:scale-110"
          >
            <Star
              size={28}
              className={cn(
                'transition-colors',
                n <= (hoveredRating || rating)
                  ? 'text-amber-400 fill-amber-400'
                  : 'text-muted-foreground/20'
              )}
            />
          </button>
        ))}
      </div>

      {rating > 0 && (
        <p className="text-center text-sm text-muted-foreground">
          {rating <= 2 ? 'We appreciate your honesty' : rating <= 3 ? 'Good to know' : rating === 4 ? 'Great!' : 'Wonderful!'}
        </p>
      )}

      <Textarea
        placeholder="Any comments? (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        className="resize-none"
      />

      {error && <p className="text-sm text-destructive text-center">{error}</p>}

      <Button
        className="w-full"
        disabled={!rating || submitting}
        onClick={submitFeedback}
      >
        {submitting ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Send size={16} className="mr-2" />}
        Submit Feedback
      </Button>
    </div>
  );
}
