'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, X } from 'lucide-react';
import { CONTACT_STAGES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { H2, PRIMARY_PILL, GHOST_PILL, SECTION_LABEL } from '@/lib/typography';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  budget: z.string().optional(),
  preferences: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  type: z.enum(['QUALIFICATION', 'TOUR', 'APPLICATION']),
  tags: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

type SubmitData = Omit<FormData, 'tags' | 'budget'> & {
  tags: string[];
  properties: string[];
  budget?: number;
};

interface ContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: SubmitData) => Promise<void>;
  defaultValues?: Partial<FormData & { properties?: string }>;
  /** When set, overrides the default "Add a person" / "Edit person" title. */
  title?: string;
  /** Distinguishes add vs. edit so we can label the submit button correctly. */
  mode?: 'add' | 'edit';
  /** Required for "Type it" mode (calls the per-space parse endpoint). */
  slug?: string;
}

function FieldRow({
  id,
  label,
  optional,
  error,
  children,
}: {
  id?: string;
  label: string;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[12.5px] font-medium text-foreground">
        {label}
        {optional && (
          <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">(optional)</span>
        )}
      </Label>
      {children}
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}

/**
 * Chip input — type-and-commit list of strings. Enter or comma commits
 * the current draft as a chip. Backspace on empty input pops the last chip.
 * Clicking a chip's X removes it. The input ALWAYS sits at the end so the
 * row reads left-to-right like a sentence.
 */
function ChipInput({
  id,
  values,
  onChange,
  placeholder,
}: {
  id?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (values.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...values, trimmed]);
    setDraft('');
  }

  function remove(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
      return;
    }
    if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      e.preventDefault();
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className={cn(
        'flex flex-wrap items-center gap-1.5 min-h-9 w-full rounded-md border border-input bg-transparent px-2 py-1.5',
        'focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 transition-[box-shadow,border-color]',
      )}
    >
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-md bg-foreground/[0.04] border border-border/60 text-[12px] text-foreground"
        >
          {value}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              remove(index);
            }}
            aria-label={`Remove ${value}`}
            className="w-4 h-4 inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
          >
            <X size={11} strokeWidth={2} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => commit(draft)}
        placeholder={values.length === 0 ? placeholder : ''}
        className="bg-transparent outline-none placeholder:text-muted-foreground/60 text-sm h-7 flex-1 min-w-[120px]"
      />
    </div>
  );
}

// ── Type it mode — parse helpers ────────────────────────────────────────────

type ParsedContact = {
  name: string;
  email: string | null;
  phone: string | null;
  type: 'rental' | 'buyer' | 'seller' | null;
  stage: 'Qualifying' | 'Tour' | 'Application' | null;
  monthlyBudget: number | null;
  properties: string[];
  preferences: string | null;
  confidence: 'high' | 'medium' | 'low';
};

type ParseErrorCode =
  | 'no_name'
  | 'too_short'
  | 'rate_limited'
  | 'parse_failed'
  | 'invalid_input';

/** Map the parser's "Qualifying"/"Tour"/"Application" string to the DB enum. */
function stageToType(stage: ParsedContact['stage']): FormData['type'] {
  if (stage === 'Tour') return 'TOUR';
  if (stage === 'Application') return 'APPLICATION';
  return 'QUALIFICATION';
}

export function ContactForm({
  open,
  onOpenChange,
  onSubmit,
  defaultValues,
  title,
  mode = 'add',
  slug,
}: ContactFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: CONTACT_STAGES[0].key, ...defaultValues },
  });

  // Properties live outside react-hook-form so the chip input owns them.
  const initialProperties = (() => {
    const raw = defaultValues?.properties;
    if (!raw) return [];
    return raw.split(',').map((p) => p.trim()).filter(Boolean);
  })();
  const [properties, setProperties] = useState<string[]>(initialProperties);

  // ── Type it mode state ────────────────────────────────────────────────────
  // Default to "type" for add; edit mode is always the form (no parsing needed).
  const canType = mode === 'add' && !!slug;
  const [tab, setTab] = useState<'type' | 'fill'>(canType ? 'type' : 'fill');
  const [typedText, setTypedText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pendingPreview, setPendingPreview] = useState<ParsedContact | null>(null);

  // Reset every time the modal opens so the realtor chooses fresh each time.
  useEffect(() => {
    if (!open) return;
    setTab(canType ? 'type' : 'fill');
    setTypedText('');
    setParsing(false);
    setParseError(null);
    setPendingPreview(null);
  }, [open, canType]);

  const type = watch('type');
  const displayTitle = title ?? (mode === 'edit' ? 'Edit person' : 'Add a person');

  function resetAll() {
    reset();
    setProperties([]);
    setTypedText('');
    setParseError(null);
    setPendingPreview(null);
  }

  async function persistParsed(parsed: ParsedContact) {
    try {
      await onSubmit({
        name: parsed.name,
        email: parsed.email ?? '',
        phone: parsed.phone ?? '',
        budget: parsed.monthlyBudget ?? undefined,
        preferences: parsed.preferences ?? '',
        address: '',
        notes: '',
        type: stageToType(parsed.stage),
        properties: parsed.properties,
        tags: [],
      });
      toast.success(`Added ${parsed.name}.`);
    } catch {
      toast.error("Couldn't save that. Try again.");
      return;
    }
    resetAll();
    onOpenChange(false);
  }

  /** Pre-fill the "Fill it in" form with parsed values, then flip the tab. */
  function flipToFillWith(parsed: ParsedContact) {
    setValue('name', parsed.name, { shouldDirty: true });
    setValue('email', parsed.email ?? '', { shouldDirty: true });
    setValue('phone', parsed.phone ?? '', { shouldDirty: true });
    setValue(
      'budget',
      parsed.monthlyBudget != null ? String(parsed.monthlyBudget) : '',
      { shouldDirty: true },
    );
    setValue('preferences', parsed.preferences ?? '', { shouldDirty: true });
    setValue('type', stageToType(parsed.stage), { shouldDirty: true });
    setProperties(parsed.properties);
    setPendingPreview(null);
    setTab('fill');
  }

  /** OpenAI is rate limited / unavailable — drop the typed text into the form. */
  function flipToFillFromError(text: string) {
    setValue('preferences', text, { shouldDirty: true });
    setTab('fill');
    setParseError(null);
  }

  async function handleParseSubmit() {
    if (!slug) return;
    const text = typedText.trim();
    if (!text) {
      setParseError("Couldn't extract a person from that.");
      return;
    }
    setParsing(true);
    setParseError(null);

    try {
      const res = await fetch('/api/contacts/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, text }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 429 || (payload as { code?: ParseErrorCode })?.code === 'rate_limited') {
          toast.message("I'm slow today — try the form instead.");
          flipToFillFromError(text);
          return;
        }
        setParseError(
          (payload as { error?: string })?.error ?? "Couldn't extract a person from that.",
        );
        return;
      }

      // 200 OK + error field = parser declined (no_name, too_short, parse_failed).
      if ((payload as { error?: string }).error) {
        setParseError(
          (payload as { error?: string }).error ?? "Couldn't extract a person from that.",
        );
        return;
      }

      const parsed = payload as ParsedContact;

      // Confidence-low or missing both contact channels → confirm before saving.
      const lowConfidence =
        parsed.confidence === 'low' || (!parsed.email && !parsed.phone);
      if (lowConfidence) {
        setPendingPreview(parsed);
        return;
      }

      await persistParsed(parsed);
    } catch {
      setParseError("Couldn't extract a person from that.");
    } finally {
      setParsing(false);
    }
  }

  async function handleFormSubmit(data: FormData) {
    const tags = data.tags
      ? data.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];
    const budget = data.budget ? parseFloat(data.budget) : undefined;
    const { tags: _rawTags, ...rest } = data;
    try {
      await onSubmit({ ...rest, budget, properties, tags });
      toast.success(mode === 'edit' ? 'Saved.' : 'Added.');
    } catch {
      toast.error("Couldn't save that. Try again.");
      return;
    }
    resetAll();
    onOpenChange(false);
  }

  // Stage segmented control — show inline if 4 or fewer stages; otherwise
  // fall back to the existing Select. Today we have 3, so this always renders
  // as the segmented control.
  const useSegmented = CONTACT_STAGES.length <= 4;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md w-full max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border/60">
          <h2 className={H2}>{displayTitle}</h2>
        </div>

        {/* Mode toggle — only when "Type it" is available (add + slug present) */}
        {canType && (
          <div className="px-6 pt-5">
            <div
              role="tablist"
              aria-label="Add mode"
              className="inline-flex items-center gap-1 bg-foreground/[0.04] rounded-full p-0.5"
            >
              {(['type', 'fill'] as const).map((key) => {
                const active = tab === key;
                const label = key === 'type' ? 'Type it' : 'Fill it in';
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      // Don't drop a parsed preview if mid-confirm — clear it.
                      setPendingPreview(null);
                      setParseError(null);
                      setTab(key);
                    }}
                    className={cn(
                      'rounded-full px-3 h-7 text-xs font-medium transition-colors',
                      active
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'type' && canType ? (
          <TypeItBody
            text={typedText}
            onTextChange={(v) => {
              setTypedText(v);
              if (parseError) setParseError(null);
            }}
            error={parseError}
            parsing={parsing}
            preview={pendingPreview}
            onSubmit={handleParseSubmit}
            onCancel={() => {
              resetAll();
              onOpenChange(false);
            }}
            onConfirmPreview={() => pendingPreview && persistParsed(pendingPreview)}
            onEditDetails={() => pendingPreview && flipToFillWith(pendingPreview)}
          />
        ) : (
          <form onSubmit={handleSubmit(handleFormSubmit)}>
            <div className="p-6 space-y-4">
              <FieldRow id="name" label="Name" error={errors.name?.message}>
                <Input id="name" {...register('name')} autoFocus />
              </FieldRow>

              <FieldRow id="type" label="Stage">
                {useSegmented ? (
                  <div
                    role="radiogroup"
                    aria-label="Stage"
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-foreground/[0.02] p-1"
                  >
                    {CONTACT_STAGES.map((s) => {
                      const active = type === s.key;
                      return (
                        <button
                          key={s.key}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setValue('type', s.key, { shouldDirty: true })}
                          className={cn(
                            'h-7 px-3 rounded-[5px] text-xs font-medium transition-colors duration-150',
                            active
                              ? 'bg-foreground text-background'
                              : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
                          )}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Select
                    value={type}
                    onValueChange={(v) => setValue('type', v as FormData['type'])}
                  >
                    <SelectTrigger id="type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_STAGES.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FieldRow>

              <FieldRow id="email" label="Email" optional error={errors.email?.message}>
                <Input id="email" type="email" {...register('email')} />
              </FieldRow>

              <FieldRow id="phone" label="Phone" optional>
                <Input id="phone" {...register('phone')} />
              </FieldRow>

              {/* Hairline divider — identity above, qualification below */}
              <div className="border-t border-border/60 !my-7" />

              <FieldRow id="budget" label="Monthly budget" optional>
                <Input
                  id="budget"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 2500"
                  {...register('budget')}
                />
              </FieldRow>

              <FieldRow id="preferences" label="Looking for" optional>
                <Textarea
                  id="preferences"
                  rows={3}
                  placeholder="Neighborhoods, bedrooms, pet-friendly…"
                  {...register('preferences')}
                />
              </FieldRow>

              <FieldRow id="properties" label="Interested in" optional>
                <ChipInput
                  id="properties"
                  values={properties}
                  onChange={setProperties}
                  placeholder="Type an address, press Enter"
                />
              </FieldRow>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border/60 flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => {
                  resetAll();
                  onOpenChange(false);
                }}
                className={GHOST_PILL}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={cn(PRIMARY_PILL, 'disabled:opacity-60 disabled:cursor-not-allowed')}
              >
                {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {mode === 'edit' ? 'Save' : 'Add'}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Type it mode body ───────────────────────────────────────────────────────

function TypeItBody({
  text,
  onTextChange,
  error,
  parsing,
  preview,
  onSubmit,
  onCancel,
  onConfirmPreview,
  onEditDetails,
}: {
  text: string;
  onTextChange: (v: string) => void;
  error: string | null;
  parsing: boolean;
  preview: ParsedContact | null;
  onSubmit: () => void;
  onCancel: () => void;
  onConfirmPreview: () => void;
  onEditDetails: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Autofocus the textarea on mount and whenever the preview clears.
  useEffect(() => {
    if (!preview) textareaRef.current?.focus();
  }, [preview]);

  // Cmd/Ctrl+Enter to submit — small touch but it pays for itself.
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!parsing) onSubmit();
    }
  }

  return (
    <div>
      <div className="p-6 pt-5 space-y-4">
        {!preview ? (
          <>
            <p className={SECTION_LABEL}>Tell me about this person.</p>
            <Textarea
              ref={textareaRef}
              rows={6}
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={500}
              placeholder="Sarah Lee, sarah@email.com, looking at $4200/mo rentals — saw 25 Park Slope last week."
              className="resize-none"
              disabled={parsing}
            />
            <p className="text-xs text-muted-foreground">
              I&apos;ll figure out their stage, contact info, and what they&apos;re looking for.
            </p>
            {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
          </>
        ) : (
          <ParsedPreviewCard parsed={preview} />
        )}
      </div>

      <div className="px-6 py-4 border-t border-border/60 flex items-center justify-end gap-1">
        {!preview ? (
          <>
            <button type="button" onClick={onCancel} className={GHOST_PILL} disabled={parsing}>
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={parsing || text.trim().length === 0}
              className={cn(PRIMARY_PILL, 'disabled:opacity-60 disabled:cursor-not-allowed')}
            >
              {parsing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Reading…
                </>
              ) : (
                'Add'
              )}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onEditDetails} className={GHOST_PILL}>
              Edit details
            </button>
            <button type="button" onClick={onConfirmPreview} className={PRIMARY_PILL}>
              Save
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ParsedPreviewCard({ parsed }: { parsed: ParsedContact }) {
  const rows: { label: string; value: string }[] = [
    { label: 'Name', value: parsed.name },
    { label: 'Email', value: parsed.email ?? '—' },
    { label: 'Phone', value: parsed.phone ?? '—' },
    {
      label: 'Stage',
      value: parsed.stage ?? 'Qualifying',
    },
    {
      label: 'Type',
      value: parsed.type ? parsed.type[0].toUpperCase() + parsed.type.slice(1) : '—',
    },
    {
      label: 'Budget',
      value:
        parsed.monthlyBudget != null ? `$${parsed.monthlyBudget.toLocaleString()}/mo` : '—',
    },
    {
      label: 'Looking for',
      value: parsed.preferences ?? '—',
    },
    {
      label: 'Properties',
      value: parsed.properties.length > 0 ? parsed.properties.join(', ') : '—',
    },
  ];

  return (
    <div className="space-y-3">
      <p className={SECTION_LABEL}>Here&apos;s what I got. Anything missing?</p>
      <div className="rounded-lg border border-border/60 bg-foreground/[0.02] divide-y divide-border/60">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline gap-3 px-4 py-2.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-24 flex-shrink-0">
              {row.label}
            </span>
            <span className="text-sm text-foreground break-words min-w-0">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
