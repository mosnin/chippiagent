'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2 } from 'lucide-react';
import type { FormQuestion } from '@/lib/types';

// ─── Locked paper-flat input language ──────────────────────────────────────
// Same family as booking-form's INPUT_CLASS / TEXTAREA_CLASS / FIELD_LABEL.
// Drop shadcn's chunky focus rings — the focus signal is a quiet border
// transition to foreground/30. Inputs read as one family with the wrapper.

const FIELD_BASE =
  'w-full bg-background border border-border/70 rounded-md px-3 text-base focus:border-foreground/30 focus:outline-none transition-colors placeholder:text-muted-foreground/70';
const INPUT_CLASS = cn(FIELD_BASE, 'h-10');
const TEXTAREA_CLASS = cn(FIELD_BASE, 'py-2 min-h-[80px] resize-y');
const FIELD_LABEL = 'text-sm font-medium text-foreground';
const HELPER_TEXT = 'text-xs text-muted-foreground mt-0.5';
const ERROR_TEXT = 'text-xs text-rose-600 dark:text-rose-400 mt-1';
const OPTIONAL_TAG = 'ml-1.5 text-xs font-normal text-muted-foreground';

// Tile cards (radio / single-select). Selection uses foreground tone — no
// bright accent ring, just a subtle wash + faint ring.
const TILE_BASE =
  'w-full text-left flex items-start gap-3 p-4 rounded-lg border transition-colors';
const TILE_IDLE = 'border-border/70 hover:bg-foreground/[0.04]';
const TILE_ACTIVE = 'border-foreground/40 bg-foreground/[0.045] ring-2 ring-foreground/10';

// Multi-select pills (chip pattern from contact-form).
const PILL_BASE =
  'inline-flex items-center gap-1.5 h-8 pl-3 pr-3 rounded-full border text-sm transition-colors';
const PILL_IDLE =
  'border-border/70 text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground';
const PILL_ACTIVE = 'border-foreground/40 bg-foreground/[0.045] text-foreground';

// Helper — renders the locked label + optional tag.
function FieldLabel({
  htmlFor,
  question,
}: {
  htmlFor?: string;
  question: FormQuestion;
}) {
  return (
    <label htmlFor={htmlFor} className={FIELD_LABEL}>
      {question.label}
      {!question.required && <span className={OPTIONAL_TAG}>(optional)</span>}
    </label>
  );
}

function FieldDescription({ description }: { description?: string }) {
  if (!description) return null;
  return <p className={HELPER_TEXT}>{description}</p>;
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className={ERROR_TEXT}>{error}</p>;
}

// ─── Selection tile (radio / single-select) ────────────────────────────────
function SelectionTile({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(TILE_BASE, selected ? TILE_ACTIVE : TILE_IDLE)}
    >
      <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
      {selected && (
        <CheckCircle2 size={16} className="text-foreground flex-shrink-0 mt-0.5" />
      )}
    </button>
  );
}

// ─── Multi-select pill (checkbox-style chip) ───────────────────────────────
function MultiSelectPill({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(PILL_BASE, checked ? PILL_ACTIVE : PILL_IDLE)}
    >
      {checked && <CheckCircle2 size={13} className="text-foreground flex-shrink-0" />}
      {label}
    </button>
  );
}

export interface QuestionRendererProps {
  question: FormQuestion;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  error?: string;
  // Preserved for API compatibility with the wrapper. Locked language no
  // longer paints selection states with the brand accent — selection uses
  // foreground tones. The prop is retained but intentionally unused.
  accentColor?: string;
  /**
   * Suppress the `<FieldLabel>` row above the input. Used by the intake
   * chat surface — there, the assistant message *is* the question, so a
   * second label below would be duplicative. Default false preserves the
   * form-builder preview's appearance exactly.
   */
  hideLabel?: boolean;
  /**
   * Suppress the helper-description row. Same chat-surface reason.
   * Default false.
   */
  hideDescription?: boolean;
}

/**
 * Renders a single FormQuestion based on its type.
 * Reusable in both the public intake form and the form builder preview.
 */
export function QuestionRenderer({
  question,
  value,
  onChange,
  error,
  hideLabel = false,
  hideDescription = false,
}: QuestionRendererProps) {
  const generatedId = useId();
  const inputId = `q-${question.id}-${generatedId}`;
  const strValue = typeof value === 'string' ? value : '';
  const arrValue = Array.isArray(value) ? value : [];

  const hasError = !!error;
  const errorBorder = hasError ? 'border-rose-500/60 focus:border-rose-500/60' : '';

  // Single source for the optional label + description rows so every case
  // in the switch below opts in identically. Checkbox keeps its inline
  // label regardless of `hideLabel` — the label is the interactive target.
  const labelNode =
    !hideLabel && question.type !== 'checkbox' ? (
      <FieldLabel htmlFor={inputId} question={question} />
    ) : null;
  const descriptionNode =
    !hideDescription ? <FieldDescription description={question.description} /> : null;

  switch (question.type) {
    // ── Text input ──
    case 'text':
      return (
        <div className="space-y-1.5">
          {labelNode}
          {descriptionNode}
          <input
            id={inputId}
            type="text"
            placeholder={question.placeholder}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            className={cn(INPUT_CLASS, errorBorder)}
            minLength={question.validation?.minLength}
            maxLength={question.validation?.maxLength}
          />
          <FieldError error={error} />
        </div>
      );

    // ── Textarea ──
    case 'textarea':
      return (
        <div className="space-y-1.5">
          {labelNode}
          {descriptionNode}
          <textarea
            id={inputId}
            placeholder={question.placeholder}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            className={cn(TEXTAREA_CLASS, errorBorder)}
            maxLength={question.validation?.maxLength}
          />
          <FieldError error={error} />
        </div>
      );

    // ── Email ──
    case 'email':
      return (
        <div className="space-y-1.5">
          {labelNode}
          {descriptionNode}
          <input
            id={inputId}
            type="email"
            placeholder={question.placeholder || 'alex@email.com'}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            className={cn(INPUT_CLASS, errorBorder)}
          />
          <FieldError error={error} />
        </div>
      );

    // ── Phone ──
    case 'phone':
      return (
        <div className="space-y-1.5">
          {labelNode}
          {descriptionNode}
          <input
            id={inputId}
            type="tel"
            placeholder={question.placeholder || '(555) 123-4567'}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            className={cn(INPUT_CLASS, errorBorder)}
          />
          <FieldError error={error} />
        </div>
      );

    // ── Number ──
    case 'number':
      return (
        <div className="space-y-1.5">
          {labelNode}
          {descriptionNode}
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            placeholder={question.placeholder}
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            className={cn(INPUT_CLASS, errorBorder)}
            min={question.validation?.min}
            max={question.validation?.max}
          />
          <FieldError error={error} />
        </div>
      );

    // ── Select (selection tiles — single choice) ──
    case 'select':
      return (
        <div className="space-y-1.5">
          {labelNode}
          {descriptionNode}
          <div className="space-y-2 pt-1">
            {(question.options ?? []).map((option) => (
              <SelectionTile
                key={option.value}
                label={option.label}
                selected={strValue === option.value}
                onClick={() => onChange(option.value)}
              />
            ))}
          </div>
          <FieldError error={error} />
        </div>
      );

    // ── Multi-select (pill chips) ──
    case 'multi_select': {
      const selected =
        arrValue.length > 0 ? arrValue : strValue ? strValue.split(',').filter(Boolean) : [];
      const toggle = (val: string) => {
        const updated = selected.includes(val)
          ? selected.filter((v) => v !== val)
          : [...selected, val];
        onChange(updated);
      };
      return (
        <div className="space-y-1.5">
          {labelNode}
          {descriptionNode}
          <div className="flex flex-wrap gap-2 pt-1">
            {(question.options ?? []).map((option) => (
              <MultiSelectPill
                key={option.value}
                label={option.label}
                checked={selected.includes(option.value)}
                onClick={() => toggle(option.value)}
              />
            ))}
          </div>
          <FieldError error={error} />
        </div>
      );
    }

    // ── Radio (selection tiles — same visual as select) ──
    case 'radio':
      return (
        <div className="space-y-1.5">
          {labelNode}
          {descriptionNode}
          <div className="space-y-2 pt-1">
            {(question.options ?? []).map((option) => (
              <SelectionTile
                key={option.value}
                label={option.label}
                selected={strValue === option.value}
                onClick={() => onChange(option.value)}
              />
            ))}
          </div>
          <FieldError error={error} />
        </div>
      );

    // ── Checkbox (single boolean toggle) ──
    case 'checkbox':
      return (
        <div className="space-y-1.5">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id={inputId}
              checked={strValue === 'true'}
              onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
              className="mt-0.5 h-4 w-4 rounded border-border/70 cursor-pointer accent-foreground focus:outline-none focus:ring-2 focus:ring-foreground/30"
            />
            <label
              htmlFor={inputId}
              className="text-sm text-foreground leading-snug cursor-pointer"
            >
              {question.label}
              {!question.required && <span className={OPTIONAL_TAG}>(optional)</span>}
            </label>
          </div>
          {question.description && (
            <p className="text-xs text-muted-foreground ml-7">{question.description}</p>
          )}
          {hasError && <p className="text-xs text-rose-600 dark:text-rose-400 ml-7">{error}</p>}
        </div>
      );

    // ── Date ──
    case 'date':
      return (
        <div className="space-y-1.5">
          {labelNode}
          {descriptionNode}
          <input
            id={inputId}
            type="date"
            value={strValue}
            onChange={(e) => onChange(e.target.value)}
            className={cn(INPUT_CLASS, errorBorder)}
          />
          <FieldError error={error} />
        </div>
      );

    default:
      return null;
  }
}

// ── Validation helper ────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[\d\s()+\-.]{7,}$/;

/**
 * Validate a single question's answer.
 * Returns an error message string or null if valid.
 */
export function validateQuestion(
  question: FormQuestion,
  value: string | string[] | undefined,
): string | null {
  const strVal = typeof value === 'string' ? value.trim() : '';
  const arrVal = Array.isArray(value) ? value.filter(Boolean) : [];
  const isEmpty =
    (typeof value === 'string' && strVal === '') ||
    (Array.isArray(value) && arrVal.length === 0) ||
    value === undefined;

  // Required check
  if (question.required && isEmpty) {
    if (question.type === 'checkbox') {
      if (strVal !== 'true') return `${question.label} is required`;
    } else {
      return `${question.label} is required`;
    }
  }

  // Skip further validation if empty and not required
  if (isEmpty) return null;

  // Type-specific validation
  if (question.type === 'email' && strVal && !EMAIL_REGEX.test(strVal)) {
    return 'Invalid email address';
  }

  if (question.type === 'phone' && strVal && !PHONE_REGEX.test(strVal)) {
    return 'Invalid phone number';
  }

  if (question.type === 'number' && strVal) {
    const num = Number(strVal);
    if (isNaN(num)) return 'Must be a number';
    if (question.validation?.min !== undefined && num < question.validation.min) {
      return `Must be at least ${question.validation.min}`;
    }
    if (question.validation?.max !== undefined && num > question.validation.max) {
      return `Must be at most ${question.validation.max}`;
    }
  }

  // Custom pattern
  if (question.validation?.pattern && strVal) {
    try {
      const regex = new RegExp(question.validation.pattern);
      if (!regex.test(strVal)) {
        return 'Invalid format';
      }
    } catch {
      // Invalid regex in config — skip
    }
  }

  // Min/max length
  if (question.validation?.minLength !== undefined && strVal.length < question.validation.minLength) {
    return `Must be at least ${question.validation.minLength} characters`;
  }
  if (question.validation?.maxLength !== undefined && strVal.length > question.validation.maxLength) {
    return `Must be at most ${question.validation.maxLength} characters`;
  }

  return null;
}
