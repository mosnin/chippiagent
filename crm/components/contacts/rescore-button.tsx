'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  contactId: string;
  onComplete?: (result: { leadScore: number | null; scoreLabel: string; scoreSummary: string | null }) => void;
}

export function RescoreButton({ contactId, onComplete }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRescore() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}/rescore`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setDone(true);
        toast.success('Re-scored.');
        onComplete?.(data);
        setTimeout(() => router.refresh(), 800);
      } else {
        toast.error("Couldn't score that. Try again.");
        setError("Couldn't score that. Try again.");
      }
    } catch {
      setError("Couldn't score that. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleRescore}
        disabled={loading || done}
        className={cn(
          'inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5 border transition-colors',
          done
            ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/10 dark:border-emerald-500/20'
            : 'text-muted-foreground bg-muted border-border hover:bg-accent hover:text-foreground',
          loading && 'opacity-60 cursor-not-allowed',
        )}
      >
        {loading ? (
          <RotateCcw size={11} className="animate-spin" />
        ) : done ? (
          <MessageCircle size={11} />
        ) : (
          <RotateCcw size={11} />
        )}
        {loading ? 'Scoring' : done ? 'Scored.' : 'Re-score'}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
