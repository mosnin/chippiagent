'use client';

import { cn } from '@/lib/utils';
import { SECTION_LABEL } from '@/lib/typography';

const CAPABILITIES = [
  { value: 'lead_analysis', label: 'Lead Analysis' },
  { value: 'market_research', label: 'Market Research' },
  { value: 'email_drafting', label: 'Email Drafting' },
  { value: 'deal_strategy', label: 'Deal Strategy' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'data_synthesis', label: 'Data Synthesis' },
  { value: 'negotiation', label: 'Negotiation Tips' },
  { value: 'report_writing', label: 'Report Writing' },
];

interface AgentCapabilityPickerProps {
  value: string[];
  onChange: (value: string[]) => void;
}

export function AgentCapabilityPicker({ value, onChange }: AgentCapabilityPickerProps) {
  function toggle(capability: string) {
    if (value.includes(capability)) {
      onChange(value.filter((v) => v !== capability));
    } else {
      onChange([...value, capability]);
    }
  }

  return (
    <div className="space-y-2">
      <p className={cn(SECTION_LABEL)}>Capabilities</p>
      <div className="flex flex-wrap gap-2">
        {CAPABILITIES.map((cap) => {
          const active = value.includes(cap.value);
          return (
            <button
              key={cap.value}
              type="button"
              onClick={() => toggle(cap.value)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs cursor-pointer transition-colors',
                active
                  ? 'bg-foreground text-background border-foreground'
                  : 'border-border/60 text-muted-foreground hover:border-foreground/40',
              )}
            >
              {cap.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
