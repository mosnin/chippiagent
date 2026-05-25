'use client';

import { Lock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PermissionBlock } from '@/lib/ai-tools/blocks';

interface PermissionBlockViewProps {
  block: PermissionBlock;
  className?: string;
}

/**
 * Historical view of a denied / dismissed permission prompt. Shown on page
 * reload so the transcript explains why the thread ended without a send.
 * Compact by design — the active approval card (PermissionPromptView) is
 * where the interactive surface lives; this is read-only history.
 */
export function PermissionBlockView({ block, className }: PermissionBlockViewProps) {
  const label = block.decision === 'denied' ? 'Denied' : 'Dismissed';
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-muted/20 px-3 py-2 flex items-center gap-2.5',
        className,
      )}
    >
      <div className="w-6 h-6 rounded-md bg-background flex items-center justify-center flex-shrink-0 text-muted-foreground">
        <Lock size={12} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{block.summary}</p>
      </div>
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground flex-shrink-0">
        <X size={11} />
        {label}
      </span>
    </div>
  );
}
