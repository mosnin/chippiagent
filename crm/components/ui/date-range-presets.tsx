'use client';

import { cn } from '@/lib/utils';

const PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'All', days: 365 },
] as const;

interface DateRangePresetsProps {
  value: number;
  onChange: (days: number) => void;
  className?: string;
}

export function DateRangePresets({ value, onChange, className }: DateRangePresetsProps) {
  return (
    <div className={cn('flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5', className)}>
      {PRESETS.map((preset) => (
        <button
          key={preset.days}
          type="button"
          onClick={() => onChange(preset.days)}
          className={cn(
            'px-3 py-1 rounded-md text-xs font-medium transition-colors',
            value === preset.days
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
