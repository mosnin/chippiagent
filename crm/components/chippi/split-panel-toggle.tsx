'use client';

import { Columns2, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SplitPanelToggleProps {
  isSplit: boolean;
  onToggle: () => void;
  className?: string;
}

export function SplitPanelToggle({ isSplit, onToggle, className }: SplitPanelToggleProps) {
  return (
    // hidden on mobile — split panel is disabled below md breakpoint
    <div className="hidden md:flex">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggle}
              aria-label={isSplit ? 'Single view' : 'Split view'}
              className={cn(
                'w-8 h-8 flex items-center justify-center rounded-lg',
                'text-muted-foreground/70 hover:text-foreground hover:bg-muted/60',
                'transition-colors',
                className,
              )}
            >
              {isSplit ? <Square size={15} /> : <Columns2 size={15} />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isSplit ? 'Single view' : 'Split view'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
