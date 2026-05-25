'use client';

import { useState, useEffect } from 'react';
import { Star, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TourFeedbackBadgeProps {
  tourId: string;
  slug: string;
  status: string;
}

export function TourFeedbackBadge({ tourId, slug, status }: TourFeedbackBadgeProps) {
  const [feedback, setFeedback] = useState<{ rating: number; comment: string | null } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (status !== 'completed') return;
    fetch(`/api/tours/feedback?slug=${slug}&tourId=${tourId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.rating) setFeedback(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [tourId, slug, status]);

  if (status !== 'completed' || !loaded) return null;
  if (!feedback) return null;

  return (
    <div className="flex items-center gap-0.5" title={feedback.comment || `${feedback.rating}/5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={10}
          className={cn(
            i < feedback.rating ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/20'
          )}
        />
      ))}
    </div>
  );
}
