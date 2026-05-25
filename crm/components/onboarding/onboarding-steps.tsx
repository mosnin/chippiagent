'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BODY_MUTED, GHOST_PILL, PRIMARY_PILL, SECTION_LABEL, TITLE_FONT } from '@/lib/typography';

/**
 * Shared scaffolding used by every step type: centered heading, optional
 * subtitle, content slot, primary action button, and a "skip" affordance for
 * optional questions. Keeping one scaffold means visual consistency across
 * 10+ step renderings without repeating layout code.
 */
interface StepScaffoldProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  primaryLabel?: string;
  primaryDisabled?: boolean;
  primaryBusy?: boolean;
  onPrimary?: () => void;
  onSkip?: () => void;
  error?: string | null;
}

export function StepScaffold({
  title,
  subtitle,
  children,
  primaryLabel = 'Next',
  primaryDisabled,
  primaryBusy,
  onPrimary,
  onSkip,
  error,
}: StepScaffoldProps) {
  return (
    <div className="flex flex-col items-center text-center">
      <h1
        className="text-4xl tracking-tight text-foreground"
        style={TITLE_FONT}
      >
        {title}
      </h1>
      {subtitle && (
        <p className={cn(BODY_MUTED, 'mt-3 max-w-xl text-base')}>{subtitle}</p>
      )}

      <div className="mt-8 w-full">{children}</div>

      {error && (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {(onPrimary || onSkip) && (
        <div className="mt-6 flex items-center gap-2">
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className={GHOST_PILL}
            >
              Skip
            </button>
          )}
          {onPrimary && (
            <button
              type="button"
              onClick={onPrimary}
              disabled={primaryDisabled || primaryBusy}
              className={cn(
                PRIMARY_PILL,
                'h-10 px-6',
                'disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              {primaryBusy ? <Loader2 size={14} className="animate-spin" /> : null}
              {primaryLabel}
              {!primaryBusy && <ArrowRight size={14} />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared input styling ────────────────────────────────────────────────────
// Paper-flat, theme-aware. h-10 to honor the focal "this moment matters" feel.
const INPUT_CLASS =
  'w-full h-10 rounded-md border border-border/70 bg-background px-3 text-base text-foreground ' +
  'placeholder:text-muted-foreground/60 outline-none transition-colors ' +
  'focus:border-foreground/30';
const TEXTAREA_CLASS =
  'w-full rounded-md border border-border/70 bg-background px-3 py-2.5 text-base text-foreground ' +
  'placeholder:text-muted-foreground/60 outline-none transition-colors resize-none ' +
  'focus:border-foreground/30';
const LABEL_CLASS = cn(SECTION_LABEL, 'mb-2 block');

// ── Text step ──────────────────────────────────────────────────────────────

interface TextStepProps {
  title: string;
  subtitle?: string;
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onSkip?: () => void;
  type?: 'text' | 'tel' | 'url' | 'email';
  maxLength?: number;
  autoFocus?: boolean;
  required?: boolean;
  busy?: boolean;
  error?: string | null;
  /** Optional helper text under the input. */
  helper?: string;
}

export function TextStep({
  title,
  subtitle,
  label,
  placeholder,
  value,
  onChange,
  onNext,
  onSkip,
  type = 'text',
  maxLength = 200,
  autoFocus = true,
  required = true,
  busy,
  error,
  helper,
}: TextStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const disabled = required && !value.trim();

  return (
    <StepScaffold
      title={title}
      subtitle={subtitle}
      onPrimary={onNext}
      primaryDisabled={disabled}
      primaryBusy={busy}
      onSkip={onSkip}
      error={error}
    >
      <div className="mx-auto max-w-md text-left">
        {label && <label className={LABEL_CLASS}>{label}</label>}
        <input
          ref={inputRef}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !disabled) {
              e.preventDefault();
              onNext();
            }
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          className={INPUT_CLASS}
        />
        {helper && <p className="mt-2 text-xs text-muted-foreground">{helper}</p>}
      </div>
    </StepScaffold>
  );
}

// ── Textarea step ──────────────────────────────────────────────────────────

interface TextareaStepProps extends Omit<TextStepProps, 'type'> {
  rows?: number;
}

export function TextareaStep({
  title,
  subtitle,
  label,
  placeholder,
  value,
  onChange,
  onNext,
  onSkip,
  maxLength = 1000,
  autoFocus = true,
  required = false,
  busy,
  error,
  rows = 4,
}: TextareaStepProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const disabled = required && !value.trim();
  return (
    <StepScaffold
      title={title}
      subtitle={subtitle}
      onPrimary={onNext}
      primaryDisabled={disabled}
      primaryBusy={busy}
      onSkip={onSkip}
      error={error}
    >
      <div className="mx-auto max-w-lg text-left">
        {label && <label className={LABEL_CLASS}>{label}</label>}
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={rows}
          className={TEXTAREA_CLASS}
        />
      </div>
    </StepScaffold>
  );
}

// ── Multi-field step ───────────────────────────────────────────────────────

export interface MultiFieldInput {
  key: string;
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'tel' | 'url' | 'email';
  maxLength?: number;
  multiline?: boolean;
  rows?: number;
}

interface MultiFieldStepProps {
  title: string;
  subtitle?: string;
  fields: MultiFieldInput[];
  onNext: () => void;
  onSkip?: () => void;
  /** Require at least one non-empty field to advance. */
  requireAny?: boolean;
  /** Require every listed field. */
  requireAll?: boolean;
  busy?: boolean;
  error?: string | null;
}

/**
 * Groups two or three related fields onto one step (e.g. phone + bio, or
 * office address + office phone). Keeps each field labelled so the screen
 * still answers one clear question overall.
 */
export function MultiFieldStep({
  title,
  subtitle,
  fields,
  onNext,
  onSkip,
  requireAny,
  requireAll,
  busy,
  error,
}: MultiFieldStepProps) {
  // Focus the first input/textarea inside the container on mount. Querying the
  // DOM avoids juggling multiple refs across a union of element types.
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      'input, textarea',
    );
    el?.focus();
  }, []);

  const disabled =
    (requireAll && fields.some((f) => !f.value.trim())) ||
    (requireAny && !fields.some((f) => f.value.trim())) ||
    false;

  return (
    <StepScaffold
      title={title}
      subtitle={subtitle}
      onPrimary={onNext}
      primaryDisabled={disabled}
      primaryBusy={busy}
      onSkip={onSkip}
      error={error}
    >
      <div ref={containerRef} className="mx-auto max-w-lg space-y-4 text-left">
        {fields.map((f, i) => (
          <div key={f.key}>
            <label className={LABEL_CLASS}>{f.label}</label>
            {f.multiline ? (
              <textarea
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                placeholder={f.placeholder}
                maxLength={f.maxLength ?? 500}
                rows={f.rows ?? 3}
                className={TEXTAREA_CLASS}
              />
            ) : (
              <input
                type={f.type ?? 'text'}
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                onKeyDown={(e) => {
                  // Enter advances only from the last non-multiline field so a
                  // mid-form Enter doesn't accidentally submit.
                  if (e.key === 'Enter' && i === fields.length - 1 && !disabled) {
                    e.preventDefault();
                    onNext();
                  }
                }}
                placeholder={f.placeholder}
                maxLength={f.maxLength ?? 120}
                className={INPUT_CLASS}
              />
            )}
          </div>
        ))}
      </div>
    </StepScaffold>
  );
}

// ── Slug step (with live uniqueness check) ─────────────────────────────────

interface SlugStepProps {
  title: string;
  subtitle?: string;
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onCheck: (v: string) => Promise<{ available: boolean; error?: string }>;
  busy?: boolean;
  urlPrefix?: string;
}

export function SlugStep({
  title,
  subtitle,
  value,
  onChange,
  onNext,
  onCheck,
  busy,
  urlPrefix = 'chippi.app/',
}: SlugStepProps) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setAvailable(null);
    setError(null);
    const trimmed = value.trim();
    if (trimmed.length < 3) return;
    debounceRef.current = setTimeout(async () => {
      setChecking(true);
      try {
        const result = await onCheck(trimmed);
        setAvailable(result.available);
        if (!result.available) setError(result.error ?? 'That name is taken.');
      } finally {
        setChecking(false);
      }
    }, 320);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, onCheck]);

  const disabled = !value.trim() || value.trim().length < 3 || available !== true;

  return (
    <StepScaffold
      title={title}
      subtitle={subtitle}
      onPrimary={onNext}
      primaryDisabled={disabled}
      primaryBusy={busy}
      error={error && available === false ? error : null}
    >
      <div className="mx-auto max-w-md text-left">
        <label className={LABEL_CLASS}>Your intake link</label>
        <div className="flex h-10 items-stretch overflow-hidden rounded-md border border-border/70 bg-background transition-colors focus-within:border-foreground/30">
          <span className="inline-flex items-center border-r border-border/70 bg-foreground/[0.03] px-3 text-sm text-muted-foreground">
            {urlPrefix}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => {
              const next = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
              onChange(next);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !disabled) {
                e.preventDefault();
                onNext();
              }
            }}
            placeholder="your-name"
            maxLength={48}
            className="flex-1 bg-transparent px-3 text-base text-foreground placeholder:text-muted-foreground/60 outline-none"
          />
          <span className="inline-flex w-9 items-center justify-center text-sm">
            {checking ? (
              <Loader2 size={14} className="animate-spin text-muted-foreground" />
            ) : available === true ? (
              <Check size={14} className="text-foreground" />
            ) : null}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Lowercase letters, numbers, and dashes only. This is where leads will land.
        </p>
      </div>
    </StepScaffold>
  );
}

// ── Tiles step (grid of choices) ───────────────────────────────────────────

export interface TileOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  description?: string;
}

interface TilesStepProps<T extends string> {
  title: string;
  subtitle?: string;
  options: TileOption<T>[];
  value: T | null;
  onSelect: (v: T) => void;
  columns?: 2 | 3 | 4;
  advanceOnSelect?: boolean;
  onNext?: () => void;
  onSkip?: () => void;
  busy?: boolean;
}

export function TilesStep<T extends string>({
  title,
  subtitle,
  options,
  value,
  onSelect,
  columns = 4,
  advanceOnSelect = true,
  onNext,
  onSkip,
  busy,
}: TilesStepProps<T>) {
  const gridCols =
    columns === 2
      ? 'sm:grid-cols-2'
      : columns === 3
        ? 'sm:grid-cols-3'
        : 'sm:grid-cols-2 lg:grid-cols-4';
  return (
    <StepScaffold
      title={title}
      subtitle={subtitle}
      onPrimary={advanceOnSelect ? undefined : onNext}
      primaryDisabled={!value}
      primaryBusy={busy}
      onSkip={onSkip}
    >
      <div className={cn('mx-auto grid max-w-4xl grid-cols-1 gap-3', gridCols)}>
        {options.map((opt) => {
          const Icon = opt.icon;
          const selected = value === opt.value;
          return (
            <motion.button
              key={opt.value}
              type="button"
              onClick={() => {
                onSelect(opt.value);
                if (advanceOnSelect && onNext) {
                  setTimeout(() => onNext(), 140);
                }
              }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className={cn(
                'group relative flex flex-col items-center justify-center gap-2 rounded-xl border bg-background p-5 text-center transition-colors duration-150',
                selected
                  ? 'border-foreground/40 bg-foreground/[0.045] ring-2 ring-foreground/10'
                  : 'border-border/70 hover:bg-foreground/[0.04]',
              )}
            >
              {Icon && (
                <Icon
                  size={20}
                  className={cn(
                    'transition-colors',
                    selected ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground',
                  )}
                />
              )}
              <span className="text-sm font-medium text-foreground">{opt.label}</span>
              {opt.description && (
                <span className="text-xs text-muted-foreground">{opt.description}</span>
              )}
            </motion.button>
          );
        })}
      </div>
    </StepScaffold>
  );
}

// ── Photo step (optional logo/avatar upload) ───────────────────────────────

interface PhotoStepProps {
  title: string;
  subtitle?: string;
  value: string | null;
  onChange: (url: string | null) => void;
  onNext: () => void;
  onSkip: () => void;
  uploadUrl?: string;
  /** Must match one of the server's accepted types: 'logo' | 'photo' | 'broker_logo' */
  uploadKind?: 'logo' | 'photo' | 'broker_logo';
  busy?: boolean;
}

export function PhotoStep({
  title,
  subtitle,
  value,
  onChange,
  onNext,
  onSkip,
  uploadUrl = '/api/upload/onboarding',
  uploadKind = 'logo',
  busy,
}: PhotoStepProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      setError('File must be under 2MB.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', uploadKind);
      const res = await fetch(uploadUrl, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error || 'Upload failed');
        return;
      }
      onChange(data.url);
    } finally {
      setUploading(false);
    }
  }

  return (
    <StepScaffold
      title={title}
      subtitle={subtitle}
      onPrimary={onNext}
      primaryBusy={busy}
      onSkip={onSkip}
      error={error}
    >
      <div className="mx-auto flex max-w-sm flex-col items-center gap-4">
        <div
          onClick={() => fileRef.current?.click()}
          className={cn(
            'relative flex h-32 w-32 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-colors',
            value
              ? 'border-foreground/30 bg-background'
              : 'border-border/70 bg-background hover:border-foreground/30 hover:bg-foreground/[0.04]',
          )}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : uploading ? (
            <Loader2 size={22} className="animate-spin text-muted-foreground" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <span className="text-xs font-medium">Click to upload</span>
              <span className="text-[10px]">PNG · JPG · WebP</span>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Remove
          </button>
        )}
      </div>
    </StepScaffold>
  );
}
