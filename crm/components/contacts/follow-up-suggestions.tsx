'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, CalendarDays, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FollowUpSuggestionsProps {
  contactId: string;
  scoreLabel: string | null;
  contactType: string;
  hasTours: boolean;
  hasDeals: boolean;
  hasFollowUp: boolean;
}

interface Suggestion {
  label: string;
  description: string;
  delayHours: number;
}

function getSuggestions(props: FollowUpSuggestionsProps): Suggestion[] {
  const { scoreLabel, contactType, hasTours, hasDeals, hasFollowUp } = props;

  if (hasFollowUp) return [];

  const suggestions: Suggestion[] = [];

  // Score-based suggestions
  if (scoreLabel === 'hot') {
    suggestions.push({
      label: 'Same-day follow-up',
      description: 'Hot lead — reach out today while interest is high',
      delayHours: 2,
    });
  } else if (scoreLabel === 'warm') {
    suggestions.push({
      label: 'Follow up tomorrow',
      description: 'Warm lead — follow up within 24 hours',
      delayHours: 24,
    });
  } else if (scoreLabel === 'cold') {
    suggestions.push({
      label: 'Weekly check-in',
      description: 'Cold lead — set a reminder for next week',
      delayHours: 168,
    });
  }

  // Tour-based suggestions
  if (hasTours && contactType === 'TOUR' && !hasDeals) {
    suggestions.push({
      label: 'Post-tour follow-up',
      description: 'Tour completed — check in on their interest level',
      delayHours: 24,
    });
  }

  // Deal-based suggestions
  if (hasDeals) {
    suggestions.push({
      label: 'Deal check-in',
      description: 'Active deal — follow up on next steps',
      delayHours: 48,
    });
  }

  // Default for new contacts
  if (suggestions.length === 0 && contactType === 'QUALIFICATION') {
    suggestions.push({
      label: 'Initial follow-up',
      description: 'New contact — introduce yourself and gauge interest',
      delayHours: 24,
    });
  }

  return suggestions.slice(0, 2);
}

export function FollowUpSuggestions(props: FollowUpSuggestionsProps) {
  const [applying, setApplying] = useState<number | null>(null);
  const [applied, setApplied] = useState<Set<number>>(new Set());
  const router = useRouter();

  const suggestions = getSuggestions(props);
  if (suggestions.length === 0) return null;

  async function applySuggestion(index: number, delayHours: number) {
    setApplying(index);
    const followUpAt = new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString();
    try {
      const res = await fetch(`/api/contacts/${props.contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followUpAt }),
      });
      if (res.ok) {
        setApplied((prev) => new Set(prev).add(index));
        router.refresh();
      }
    } catch {
      // silent
    } finally {
      setApplying(null);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2.5">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <MessageCircle size={13} />
        Suggested follow-ups
      </div>
      <div className="space-y-2">
        {suggestions.map((s, i) => (
          <div
            key={i}
            className={cn(
              'flex items-center justify-between gap-3 p-2.5 rounded-lg border transition-all',
              applied.has(i)
                ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-900/10'
                : 'border-border bg-card hover:bg-accent/30'
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <CalendarDays size={14} className="text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs font-medium">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.description}</p>
              </div>
            </div>
            {applied.has(i) ? (
              <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium flex-shrink-0">
                <Check size={12} /> Set
              </span>
            ) : (
              <button
                onClick={() => applySuggestion(i, s.delayHours)}
                disabled={applying === i}
                className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-md bg-foreground text-background hover:opacity-80 transition-opacity disabled:opacity-50"
              >
                {applying === i ? <Loader2 size={12} className="animate-spin" /> : 'Set'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
