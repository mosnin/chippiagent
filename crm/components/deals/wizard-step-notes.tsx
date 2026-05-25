'use client';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface WizardStepNotesProps {
  description: string;
  onDescriptionChange: (v: string) => void;
}

export function WizardStepNotes({ description, onDescriptionChange }: WizardStepNotesProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Add notes</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Optional — you can always add notes later from the deal page.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wizard-description">Description / Notes</Label>
        <Textarea
          id="wizard-description"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          rows={8}
          placeholder="Add context, notes, or a description for this deal…"
        />
      </div>
    </div>
  );
}
