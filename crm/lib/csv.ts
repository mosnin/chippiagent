import type { IntakeFormConfig, Contact, ApplicationData, FormQuestion } from '@/lib/types';
import { formatAnswerValue } from '@/lib/form-versioning';

/**
 * Client-side CSV download utility.
 * Builds a CSV string from an array of flat objects and triggers a browser download.
 */
export function downloadCSV(filename: string, rows: Record<string, unknown>[]): void {
  if (!rows.length) return;

  const keys = Object.keys(rows[0]);

  const lines = [
    keys.map(escapeCsvCell).join(','),
    ...rows.map((row) => keys.map((k) => escapeCsvCell(row[k])).join(',')),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCsvCell(val: unknown): string {
  if (val == null) return '';
  const str = String(val).replace(/"/g, '""');
  // Prevent CSV formula injection: always quote cells starting with =, +, -, @, tab
  if (/^[=+\-@\t\r]/.test(str)) {
    return `"'${str}"`;  // Prefix with single quote inside quotes to neutralize formulas
  }
  return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
}

// ── System columns that always appear first ─────────────────────────────────

const SYSTEM_COLUMNS = ['Name', 'Phone', 'Email', 'Score', 'Tier', 'Score summary', 'Follow-up', 'Submitted'];

// ── Legacy hardcoded columns ────────────────────────────────────────────────

const LEGACY_COLUMNS = [
  'Employment',
  'Monthly income',
  'Monthly rent',
];

/**
 * Export contacts/leads to CSV with support for dynamic form data.
 *
 * - If contacts have `formConfigSnapshot`, use question labels as column headers
 * - If no snapshot (legacy), use the existing hardcoded column headers
 * - Mixed exports (some legacy, some dynamic) merge both column sets
 * - System fields (name, email, phone, score) always come first
 */
export function downloadLeadsCSV(filename: string, contacts: Contact[]): void {
  if (!contacts.length) return;

  // Collect all dynamic question columns across all contacts
  const dynamicColumnsSet = new Set<string>();
  const questionMap = new Map<string, FormQuestion>();
  let hasLegacy = false;
  let hasDynamic = false;

  for (const contact of contacts) {
    const snapshot = contact.formConfigSnapshot as IntakeFormConfig | null;
    if (snapshot?.sections) {
      hasDynamic = true;
      for (const section of snapshot.sections) {
        for (const q of section.questions) {
          // Skip system fields (name/email/phone) — they're in SYSTEM_COLUMNS
          if (q.system) continue;
          if (!dynamicColumnsSet.has(q.label)) {
            dynamicColumnsSet.add(q.label);
            questionMap.set(q.label, q);
          }
        }
      }
    } else {
      hasLegacy = true;
    }
  }

  // Build final column order: system + legacy (if any) + dynamic (sorted)
  const dynamicColumns = Array.from(dynamicColumnsSet).sort();
  const extraColumns = [
    ...(hasLegacy ? LEGACY_COLUMNS : []),
    ...dynamicColumns,
  ];

  const allColumns = [...SYSTEM_COLUMNS, ...extraColumns];

  const rows = contacts.map((contact) => {
    const app = contact.applicationData as (ApplicationData & Record<string, any>) | null;
    const snapshot = contact.formConfigSnapshot as IntakeFormConfig | null;

    const row: Record<string, unknown> = {
      Name: contact.name,
      Phone: contact.phone ?? '',
      Email: contact.email ?? '',
      Score: contact.leadScore != null ? Math.round(contact.leadScore) : '',
      Tier: contact.scoreLabel ?? '',
      'Score summary': contact.scoreSummary ?? '',
      'Follow-up': contact.followUpAt
        ? new Date(contact.followUpAt).toLocaleDateString('en-US')
        : '',
      Submitted: new Date(contact.createdAt).toLocaleDateString('en-US'),
    };

    // Legacy columns
    if (hasLegacy) {
      row['Employment'] = app?.employmentStatus ?? '';
      row['Monthly income'] = app?.monthlyGrossIncome ?? '';
      row['Monthly rent'] = app?.monthlyRent ?? (contact.budget ?? '');
    }

    // Dynamic columns
    if (snapshot?.sections && app) {
      for (const section of snapshot.sections) {
        for (const q of section.questions) {
          if (q.system) continue;
          if (!dynamicColumnsSet.has(q.label)) continue;
          const rawValue = app[q.id];
          row[q.label] = rawValue != null ? formatAnswerValue(rawValue, q) : '';
        }
      }
    }

    // Fill any missing dynamic columns with empty string
    for (const col of dynamicColumns) {
      if (!(col in row)) row[col] = '';
    }

    return row;
  });

  // Use allColumns to ensure consistent ordering
  const lines = [
    allColumns.map(escapeCsvCell).join(','),
    ...rows.map((row) => allColumns.map((k) => escapeCsvCell(row[k])).join(',')),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
