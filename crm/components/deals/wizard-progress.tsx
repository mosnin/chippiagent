'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WizardProgressProps {
  steps: string[];
  currentStep: number; // 1-based
  onStepClick?: (step: number) => void;
}

export function WizardProgress({ steps, currentStep, onStepClick }: WizardProgressProps) {
  return (
    <div className="flex items-center w-full">
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isCompleted = stepNumber < currentStep;
        const isActive = stepNumber === currentStep;
        const isUpcoming = stepNumber > currentStep;
        const isClickable = stepNumber <= currentStep && onStepClick != null;

        return (
          <div key={stepNumber} className="flex items-center flex-1 last:flex-none">
            {/* Step circle + label */}
            <div
              className={cn('flex flex-col items-center gap-1.5', isClickable && 'cursor-pointer')}
              onClick={() => isClickable && onStepClick(stepNumber)}
              role={isClickable ? 'button' : undefined}
              tabIndex={isClickable ? 0 : undefined}
              onKeyDown={(e) => {
                if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
                  onStepClick!(stepNumber);
                }
              }}
            >
              {/* Circle */}
              <div
                className={cn(
                  'w-8 h-8 rounded-full text-sm font-medium flex items-center justify-center transition-colors',
                  isCompleted && 'bg-primary text-primary-foreground',
                  isActive && 'bg-primary text-primary-foreground',
                  isUpcoming && 'border-2 border-muted-foreground/30 text-muted-foreground bg-transparent',
                )}
              >
                {isCompleted ? <Check size={14} strokeWidth={2.5} /> : stepNumber}
              </div>

              {/* Label */}
              <span
                className={cn(
                  'text-xs text-center leading-tight max-w-[72px]',
                  isActive && 'font-semibold text-foreground',
                  isCompleted && 'text-muted-foreground',
                  isUpcoming && 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </div>

            {/* Connector line — not rendered after the last step */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'flex-1 h-px mx-2 mb-5',
                  stepNumber < currentStep ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
