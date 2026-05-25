'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface WizardStepDetailsProps {
  title: string;
  onTitleChange: (v: string) => void;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  onPriorityChange: (v: 'LOW' | 'MEDIUM' | 'HIGH') => void;
  value: string;
  onValueChange: (v: string) => void;
  commissionRate: string;
  onCommissionRateChange: (v: string) => void;
  probability: string;
  onProbabilityChange: (v: string) => void;
  closeDate: string;
  onCloseDateChange: (v: string) => void;
  address: string;
  onAddressChange: (v: string) => void;
  titleError?: string;
}

export function WizardStepDetails({
  title,
  onTitleChange,
  priority,
  onPriorityChange,
  value,
  onValueChange,
  commissionRate,
  onCommissionRateChange,
  probability,
  onProbabilityChange,
  closeDate,
  onCloseDateChange,
  address,
  onAddressChange,
  titleError,
}: WizardStepDetailsProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Deal details</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Give this deal a title and fill in any details you know.
        </p>
      </div>

      {/* Title */}
      <div className="space-y-1.5">
        <Label htmlFor="wizard-title">
          Title <span className="text-destructive">*</span>
        </Label>
        <Input
          id="wizard-title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="e.g. 123 Maple St – Rental"
          aria-invalid={!!titleError}
        />
        {titleError && (
          <p className="text-xs text-destructive">{titleError}</p>
        )}
      </div>

      {/* Priority */}
      <div className="space-y-1.5">
        <Label>Priority</Label>
        <Select value={priority} onValueChange={(v) => onPriorityChange(v as 'LOW' | 'MEDIUM' | 'HIGH')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Numeric fields — 2-column grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="wizard-value">Deal Value ($)</Label>
          <Input
            id="wizard-value"
            type="number"
            min={0}
            step={1000}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder="e.g. 500000"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wizard-commission">Commission Rate (%)</Label>
          <Input
            id="wizard-commission"
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={commissionRate}
            onChange={(e) => onCommissionRateChange(e.target.value)}
            placeholder="e.g. 2.5"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wizard-probability">Close Probability (%)</Label>
          <Input
            id="wizard-probability"
            type="number"
            min={0}
            max={100}
            step={1}
            value={probability}
            onChange={(e) => onProbabilityChange(e.target.value)}
            placeholder="e.g. 75"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wizard-close-date">Expected Close Date</Label>
          <Input
            id="wizard-close-date"
            type="date"
            value={closeDate}
            onChange={(e) => onCloseDateChange(e.target.value)}
          />
        </div>
      </div>

      {/* Address */}
      <div className="space-y-1.5">
        <Label htmlFor="wizard-address">Property Address</Label>
        <Input
          id="wizard-address"
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
          placeholder="e.g. 456 Oak Ave, Toronto, ON"
        />
      </div>
    </div>
  );
}
