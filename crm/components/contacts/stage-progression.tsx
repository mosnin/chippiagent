'use client';

import { useState } from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface StageProgressionProps {
  contactId: string;
  currentType: string;
}

const STAGES = [
  { type: 'QUALIFICATION', label: 'Qualifying', color: 'bg-blue-500' },
  { type: 'TOUR', label: 'Tour', color: 'bg-amber-500' },
  { type: 'APPLICATION', label: 'Applied', color: 'bg-emerald-500' },
] as const;

export function StageProgression({ contactId, currentType }: StageProgressionProps) {
  const [updating, setUpdating] = useState(false);
  const router = useRouter();
  const currentIndex = STAGES.findIndex((s) => s.type === currentType);

  async function moveTo(type: string) {
    if (updating) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (res.ok) {
        router.refresh();
      }
    } catch (err) {
      console.error('[stage] Update failed:', err);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {STAGES.map((stage, i) => {
        const isActive = stage.type === currentType;
        const isPast = i < currentIndex;
        const isFuture = i > currentIndex;
        const isNext = i === currentIndex + 1;

        return (
          <div key={stage.type} className="flex items-center gap-1.5">
            {i > 0 && (
              <ArrowRight size={12} className={cn('flex-shrink-0', isPast ? 'text-foreground/40' : 'text-muted-foreground/30')} />
            )}
            <button
              type="button"
              onClick={() => isFuture ? moveTo(stage.type) : undefined}
              disabled={updating || isActive || isPast}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
                isActive && 'ring-2 ring-border',
                isPast && 'bg-muted text-muted-foreground',
                isActive && 'bg-secondary text-foreground',
                isFuture && 'border border-dashed border-muted-foreground/30 text-muted-foreground hover:border-border hover:text-foreground hover:bg-muted/50 cursor-pointer',
                (isActive || isPast) && 'cursor-default',
              )}
            >
              {isPast && <Check size={11} />}
              {updating && isNext && <Loader2 size={11} className="animate-spin" />}
              <span className={cn('w-2 h-2 rounded-full', isActive ? stage.color : isPast ? 'bg-muted-foreground/40' : 'bg-muted-foreground/20')} />
              {stage.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
