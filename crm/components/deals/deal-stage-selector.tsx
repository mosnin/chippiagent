'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DealStage } from '@/lib/types';

interface DealStageSelectorProps {
  dealId: string;
  initialStageId: string;
  stages: DealStage[];
}

export function DealStageSelector({
  dealId,
  initialStageId,
  stages,
}: DealStageSelectorProps) {
  const [stageId, setStageId] = useState(initialStageId);
  const [saving, setSaving] = useState(false);

  const currentStage = stages.find((s) => s.id === stageId) ?? stages[0];

  async function handleChange(newStageId: string) {
    if (newStageId === stageId) return;

    const previous = stageId;
    setStageId(newStageId);
    setSaving(true);

    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId: newStageId }),
      });
      if (!res.ok) throw new Error('Failed to update stage');
      toast.success('Stage updated.');
    } catch {
      setStageId(previous);
      toast.error("Couldn't update the stage. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select value={stageId} onValueChange={handleChange} disabled={saving}>
      <SelectTrigger
        className={cn(
          'h-auto border-0 shadow-none p-0 gap-1 focus-visible:ring-0 w-fit bg-transparent',
          saving && 'opacity-50',
        )}
      >
        <SelectValue asChild>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
            {currentStage && (
              <span
                className="inline-block size-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: currentStage.color }}
              />
            )}
            {currentStage?.name ?? 'Select stage'}
            <ChevronDown size={13} className="text-muted-foreground" />
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {stages
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((stage) => (
            <SelectItem key={stage.id} value={stage.id}>
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block size-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: stage.color }}
                />
                {stage.name}
              </span>
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
