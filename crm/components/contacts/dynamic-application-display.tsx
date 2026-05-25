'use client';

import { useMemo } from 'react';
import { CollapsibleSection } from '@/components/contacts/collapsible-section';
import type { IntakeFormConfig, ApplicationData } from '@/lib/types';
import { getSubmissionDisplay, type DisplayField } from '@/lib/form-versioning';
import { cn } from '@/lib/utils';

interface DynamicApplicationDisplayProps {
  applicationData: Record<string, any> | ApplicationData | null;
  formConfigSnapshot: IntakeFormConfig | null;
  /** If true, show all sections expanded by default */
  defaultOpen?: boolean;
}

/**
 * Renders a contact's application data using the stored form config
 * snapshot.  Shows sections as grouped fields with question labels.
 *
 * Falls back to a flat key-value display for legacy contacts without
 * a form config snapshot.
 */
export function DynamicApplicationDisplay({
  applicationData,
  formConfigSnapshot,
  defaultOpen = false,
}: DynamicApplicationDisplayProps) {
  const fields = useMemo(
    () =>
      getSubmissionDisplay({
        applicationData,
        formConfigSnapshot,
      }),
    [applicationData, formConfigSnapshot],
  );

  if (!applicationData || fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No application data available.
      </p>
    );
  }

  // ── Dynamic form mode: group by section ────────────────────────────────
  if (formConfigSnapshot?.sections) {
    return <SectionedDisplay fields={fields} defaultOpen={defaultOpen} />;
  }

  // ── Legacy mode: group by section title from getLegacyDisplay ──────────
  if (fields[0]?.sectionTitle) {
    return <SectionedDisplay fields={fields} defaultOpen={defaultOpen} />;
  }

  // ── Absolute fallback: flat list ──────────────────────────────────────
  return (
    <div className="divide-y divide-border/50">
      {fields.map((f, i) => (
        <FieldRow key={i} label={f.label} value={f.value} />
      ))}
    </div>
  );
}

// ── Sectioned display ────────────────────────────────────────────────────────

function SectionedDisplay({
  fields,
  defaultOpen,
}: {
  fields: DisplayField[];
  defaultOpen: boolean;
}) {
  // Group fields by section title
  const sections = useMemo(() => {
    const map = new Map<string, DisplayField[]>();
    for (const field of fields) {
      const key = field.sectionTitle ?? 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(field);
    }
    return Array.from(map.entries());
  }, [fields]);

  return (
    <div className="divide-y divide-border/50">
      {sections.map(([title, sectionFields], idx) => (
        <CollapsibleSection
          key={title}
          title={title}
          defaultOpen={defaultOpen || idx === 0}
          count={sectionFields.length}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {sectionFields.map((f, i) => (
              <FieldRow key={i} label={f.label} value={f.value} />
            ))}
          </div>
        </CollapsibleSection>
      ))}
    </div>
  );
}

// ── Field row ────────────────────────────────────────────────────────────────

function FieldRow({ label, value }: { label: string; value: string }) {
  // Detect multi-select (comma-separated with 3+ items) to render as tags
  const parts = value.includes(',') ? value.split(',').map((s) => s.trim()) : null;
  const showAsTags = parts && parts.length >= 2;

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      {showAsTags ? (
        <div className="flex flex-wrap gap-1 mt-1">
          {parts!.map((tag, i) => (
            <span
              key={i}
              className="inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5 bg-muted text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : (
        <p
          className={cn(
            'text-sm font-medium text-foreground',
            // Highlight boolean-like negative values
            (value === 'Yes' && label.toLowerCase().includes('eviction')) && 'text-destructive',
            (value === 'Yes' && label.toLowerCase().includes('bankruptcy')) && 'text-destructive',
          )}
        >
          {value}
        </p>
      )}
    </div>
  );
}
