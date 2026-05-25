'use client';

import { useState, useEffect } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DealStage } from '@/lib/types';

interface WizardStepPipelineProps {
  slug: string;
  pipelineType: 'rental' | 'buyer' | 'seller';
  onPipelineChange: (type: 'rental' | 'buyer' | 'seller') => void;
  stageId: string;
  onStageChange: (stageId: string) => void;
  detectedPipelineType?: 'rental' | 'buyer' | 'seller' | null;
  error?: string;
}

export function WizardStepPipeline({
  slug,
  pipelineType,
  onPipelineChange,
  stageId,
  onStageChange,
  detectedPipelineType,
  error,
}: WizardStepPipelineProps) {
  type PipelineType = 'rental' | 'buyer' | 'seller';
  const [allStages, setAllStages] = useState<DealStage[]>([]);
  const [loadingStages, setLoadingStages] = useState(true);

  useEffect(() => {
    async function fetchStages() {
      setLoadingStages(true);
      try {
        // Include pipelineType so the API can auto-create default buyer stages
        // when the buyer pipeline doesn't exist yet.
        const res = await fetch(
          `/api/stages?slug=${encodeURIComponent(slug)}&pipelineType=${pipelineType}`,
        );
        if (res.ok) {
          // The response is StageWithDeals[]; spread stages from all pipeline types
          // returned so switching pipelines doesn't clear previously loaded stages.
          const data: (DealStage & { deals?: unknown[] })[] = await res.json();
          setAllStages((prev) => {
            // Merge: replace stages of the fetched pipelineType, keep others
            const others = prev.filter((s) => s.pipelineType !== pipelineType);
            const incoming = data.map(({ deals: _deals, ...s }) => s as DealStage);
            return [...others, ...incoming];
          });
        }
      } finally {
        setLoadingStages(false);
      }
    }
    fetchStages();
  }, [slug, pipelineType]);

  const filteredStages = allStages
    .filter((s) => s.pipelineType === pipelineType)
    .sort((a, b) => a.position - b.position);

  function handlePipelineChange(type: PipelineType) {
    onPipelineChange(type);
    // Clear stage selection if the current stage doesn't belong to the new pipeline type
    const stageInNewPipeline = allStages.some((s) => s.id === stageId && s.pipelineType === type);
    if (!stageInNewPipeline) {
      onStageChange('');
    }
  }

  return (
    <div className="space-y-5">
      {/* Heading */}
      <div>
        <h2 className="text-lg font-semibold">Choose a pipeline and stage</h2>
      </div>

      {/* Detected pipeline suggestion banner */}
      {detectedPipelineType && (
        <div className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium',
          detectedPipelineType === 'buyer'
            ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400'
            : detectedPipelineType === 'seller'
            ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
            : 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400'
        )}>
          <Info size={13} className="flex-shrink-0" />
          Based on your contact&apos;s profile, we suggest the{' '}
          <span className="font-semibold capitalize">{detectedPipelineType}</span>{' '}
          pipeline.
        </div>
      )}

      {/* Pipeline toggle */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Pipeline type
        </p>
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
          <button
            type="button"
            onClick={() => handlePipelineChange('rental')}
            className={cn(
              'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
              pipelineType === 'rental'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Rental
          </button>
          <button
            type="button"
            onClick={() => handlePipelineChange('buyer')}
            className={cn(
              'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
              pipelineType === 'buyer'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Buyer
          </button>
          <button
            type="button"
            onClick={() => handlePipelineChange('seller')}
            className={cn(
              'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
              pipelineType === 'seller'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Seller
          </button>
        </div>
      </div>

      {/* Stage selection */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Stage
        </p>

        {loadingStages ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-14 rounded-lg bg-muted animate-pulse"
              />
            ))}
          </div>
        ) : filteredStages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No stages found for the {pipelineType} pipeline.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filteredStages.map((stage) => {
              const isSelected = stageId === stage.id;
              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => onStageChange(stage.id)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg border-2 px-3 py-3 text-left transition-all',
                    isSelected
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border bg-background text-foreground hover:border-muted-foreground/40 hover:bg-muted/40'
                  )}
                >
                  {/* Color dot */}
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="text-sm font-medium leading-tight">{stage.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Validation error */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
