'use client';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GitBranch } from 'lucide-react';
import type { IntakeFormConfig, FormSection, FormQuestion } from './types';

// ── Preview question renderer ──

function PreviewQuestion({ question }: { question: FormQuestion }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {question.label}
        {question.required && <span className="text-muted-foreground ml-0.5">*</span>}
      </Label>
      {question.description && (
        <p className="text-xs text-muted-foreground">{question.description}</p>
      )}

      {question.type === 'text' && (
        <Input placeholder={question.placeholder || ''} readOnly className="bg-background border-border/70 h-9" />
      )}

      {question.type === 'textarea' && (
        <Textarea placeholder={question.placeholder || ''} disabled className="bg-background border-border/70 min-h-[80px]" />
      )}

      {question.type === 'email' && (
        <Input type="email" placeholder={question.placeholder || 'name@example.com'} readOnly className="bg-background border-border/70 h-9" />
      )}

      {question.type === 'phone' && (
        <Input type="tel" placeholder={question.placeholder || '(555) 123-4567'} readOnly className="bg-background border-border/70 h-9" />
      )}

      {question.type === 'number' && (
        <Input type="number" placeholder={question.placeholder || '0'} readOnly className="bg-background border-border/70 h-9" />
      )}

      {question.type === 'date' && (
        <Input type="date" readOnly className="bg-background border-border/70 h-9" />
      )}

      {question.type === 'select' && (
        <Select disabled>
          <SelectTrigger className="w-full bg-background border-border/70 h-9">
            <SelectValue placeholder="Select an option..." />
          </SelectTrigger>
          <SelectContent>
            {(question.options || []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {question.type === 'multi_select' && (
        <div className="space-y-1.5">
          {(question.options || []).map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" disabled className="rounded border-border/70" />
              {opt.label}
            </label>
          ))}
        </div>
      )}

      {question.type === 'radio' && (
        <div className="space-y-1.5">
          {(question.options || []).map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="radio" name={question.id} disabled />
              {opt.label}
            </label>
          ))}
        </div>
      )}

      {question.type === 'checkbox' && (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" disabled className="rounded border-border/70" />
          {question.label}
        </label>
      )}
    </div>
  );
}

// ── Helper: format condition for display ──

function formatCondition(condition: FormSection['visibleWhen'], allSections: FormSection[]): string {
  if (!condition) return '';
  const allQuestions = allSections.flatMap((s) => s.questions);
  const refQuestion = allQuestions.find((q) => q.id === condition.questionId);
  const questionLabel = refQuestion?.label || condition.questionId;
  const refOption = refQuestion?.options?.find((o) => o.value === condition.value);
  const valueLabel = refOption?.label || condition.value;
  const operatorLabel =
    condition.operator === 'equals' ? 'is' :
    condition.operator === 'not_equals' ? 'is not' :
    'contains';
  return `"${questionLabel}" ${operatorLabel} "${valueLabel}"`;
}

// ── Preview section ──

function PreviewSection({ section, allSections }: { section: FormSection; allSections: FormSection[] }) {
  const isConditional = !!section.visibleWhen;

  return (
    <div className={cn('space-y-4', isConditional && 'opacity-70')}>
      {isConditional && (
        <div className="inline-flex items-center gap-1.5 rounded bg-foreground/[0.06] text-muted-foreground px-1.5 py-0.5 text-[10px] font-mono">
          <GitBranch size={10} className="text-muted-foreground/60 flex-shrink-0" />
          <span>Conditional · shown when {formatCondition(section.visibleWhen, allSections)}</span>
        </div>
      )}
      <div className="space-y-1">
        <h3
          className="text-base text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          {section.title}
        </h3>
        {section.description && (
          <p className="text-sm text-muted-foreground">{section.description}</p>
        )}
      </div>
      <div className="space-y-4">
        {section.questions.map((question) => (
          <PreviewQuestion key={question.id} question={question} />
        ))}
      </div>
    </div>
  );
}

// ── Main preview component ──

export interface FormPreviewProps {
  config: IntakeFormConfig;
}

export function FormPreview({ config }: FormPreviewProps) {
  if (config.sections.length === 0) {
    return (
      <div className="bg-background border border-border/70 rounded-lg p-8 max-w-2xl mx-auto text-center">
        <p className="text-sm text-muted-foreground">
          No form content to preview. Add sections and questions to see a preview.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-background border border-border/70 rounded-lg p-6 max-w-2xl mx-auto overflow-y-auto max-h-[calc(100vh-16rem)]">
      <div className="space-y-8">
        {config.sections.map((section) => (
          <PreviewSection key={section.id} section={section} allSections={config.sections} />
        ))}
      </div>

      <div className="pt-6 mt-6 border-t border-border/70 flex justify-end">
        <div className="inline-flex items-center h-9 px-4 rounded-full bg-foreground/[0.06] text-muted-foreground text-sm">
          Submit
        </div>
      </div>
    </div>
  );
}
