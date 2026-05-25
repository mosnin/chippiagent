'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, X, Download, ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ── CSV parser ──────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const parse = (line: string): string[] => {
    const cells: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQuote = false;
        else cur += ch;
      } else {
        if (ch === '"') { inQuote = true; }
        else if (ch === ',') { cells.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  };
  const nonEmpty = lines.filter((l) => l.trim());
  if (nonEmpty.length < 2) return { headers: [], rows: [] };
  const headers = parse(nonEmpty[0]);
  const rows = nonEmpty.slice(1).map(parse);
  return { headers, rows };
}

// ── Template download ────────────────────────────────────────────────────────

function downloadTemplate() {
  const csv = [
    'Name,Phone,Email,Budget,Type,Notes',
    'Jane Smith,555-123-4567,jane@example.com,2500,QUALIFICATION,Looking for 2BR near downtown',
    'Bob Chen,555-987-6543,bob@example.com,1800,TOUR,Prefers ground floor',
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'contacts-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Field mapping options ────────────────────────────────────────────────────

type ContactField = 'name' | 'phone' | 'email' | 'budget' | 'type' | 'notes' | 'ignore';

const FIELD_OPTIONS: { value: ContactField; label: string }[] = [
  { value: 'name', label: 'Name ★' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'budget', label: 'Budget ($/mo)' },
  { value: 'type', label: 'Stage (QUALIFICATION/TOUR/APPLICATION)' },
  { value: 'notes', label: 'Notes' },
  { value: 'ignore', label: '— Ignore column —' },
];

const AUTO_DETECT: Record<string, ContactField> = {
  name: 'name', 'full name': 'name', 'client name': 'name', 'contact name': 'name',
  phone: 'phone', mobile: 'phone', 'phone number': 'phone', cell: 'phone',
  email: 'email', 'email address': 'email',
  budget: 'budget', rent: 'budget', 'monthly budget': 'budget', 'max rent': 'budget',
  type: 'type', stage: 'type', status: 'type',
  notes: 'notes', note: 'notes', comments: 'notes', comment: 'notes',
};

function autoDetect(header: string): ContactField {
  return AUTO_DETECT[header.toLowerCase().trim()] ?? 'ignore';
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  slug: string;
  onClose: () => void;
  onImported: (count: number) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

type Step = 'upload' | 'map' | 'confirm' | 'done';

export function CsvImportModal({ slug, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, ContactField>>({});
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (!parsed.headers.length) {
        setError("I couldn't read that CSV. Make sure it has a header row and at least one row of data.");
        return;
      }
      setError(null);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      const autoMap: Record<number, ContactField> = {};
      parsed.headers.forEach((h, i) => { autoMap[i] = autoDetect(h); });
      setMapping(autoMap);
      setStep('map');
    };
    reader.readAsText(file);
  }

  function buildImportRows() {
    const nameCol = Object.entries(mapping).find(([, f]) => f === 'name')?.[0];
    if (nameCol == null) return null;
    return rows
      .map((row) => {
        const get = (field: ContactField) => {
          const col = Object.entries(mapping).find(([, f]) => f === field)?.[0];
          return col != null ? (row[Number(col)] ?? '') : '';
        };
        return {
          name: get('name'),
          phone: get('phone') || null,
          email: get('email') || null,
          budget: get('budget') ? parseFloat(get('budget').replace(/[^0-9.]/g, '')) || null : null,
          type: get('type') || null,
          notes: get('notes') || null,
        };
      })
      .filter((r) => r.name.trim());
  }

  const importRows = step !== 'upload' ? (buildImportRows() ?? []) : [];
  const hasNameMapping = Object.values(mapping).includes('name');

  async function handleImport() {
    const toImport = buildImportRows();
    if (!toImport || toImport.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, rows: toImport }),
      });
      if (res.ok) {
        const data = await res.json();
        setImportedCount(data.created);
        setStep('done');
        onImported(data.created);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Import failed. Please try again.');
      }
    } catch {
      setError('Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl mx-4 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-muted-foreground" />
            <h2 className="font-semibold text-base">Import Contacts</h2>
          </div>
          <div className="flex items-center gap-3">
            {/* Step indicator */}
            <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
              {(['upload', 'map', 'confirm'] as const).map((s, i) => (
                <span key={s} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={10} />}
                  <span className={cn(
                    'font-medium capitalize',
                    step === s || (step === 'done' && s === 'confirm') ? 'text-foreground' : ''
                  )}>
                    {s}
                  </span>
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Step: upload ── */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-border rounded-xl px-6 py-10 text-center hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
                onClick={() => fileRef.current?.click()}
              >
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <Upload size={20} className="text-muted-foreground" />
                </div>
                <p className="text-sm font-medium mb-1">Click to upload a CSV file</p>
                <p className="text-xs text-muted-foreground">
                  Supported columns: Name, Phone, Email, Budget, Type, Notes
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFile}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive flex items-center gap-2">
                  <AlertTriangle size={14} />
                  {error}
                </p>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-1.5 text-foreground font-medium hover:underline"
                >
                  <Download size={12} />
                  Download template CSV
                </button>
                <span>— use it to format your data</span>
              </div>
            </div>
          )}

          {/* ── Step: map ── */}
          {step === 'map' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Map your CSV columns to contact fields. <strong>Name</strong> is required.
              </p>
              <div className="space-y-2">
                {headers.map((header, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{header}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        e.g. {rows[0]?.[i] ?? '—'}
                      </p>
                    </div>
                    <div className="w-48 flex-shrink-0">
                      <Select
                        value={mapping[i] ?? 'ignore'}
                        onValueChange={(v) =>
                          setMapping((m) => ({ ...m, [i]: v as ContactField }))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value} className="text-xs">
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>

              {/* Preview table */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Preview (first 3 rows)</p>
                <div className="rounded-lg border border-border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        {headers.map((h, i) => (
                          <th key={i} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 3).map((row, r) => (
                        <tr key={r} className="border-b border-border last:border-0">
                          {headers.map((_, i) => (
                            <td key={i} className="px-3 py-2 truncate max-w-[120px]">
                              {row[i] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Step: confirm ── */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-muted/30 px-5 py-4">
                <p className="text-sm font-medium">Ready to import</p>
                <p className="text-2xl font-bold mt-1 tabular-nums">{importRows.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">contacts will be added to your workspace</p>
              </div>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-green-500 dark:text-green-400 flex-shrink-0" />
                  Stage defaults to <strong>Qualifying</strong> if not mapped
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-green-500 dark:text-green-400 flex-shrink-0" />
                  Lead scoring runs manually after import
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-green-500 dark:text-green-400 flex-shrink-0" />
                  Rows without a name are skipped
                </li>
              </ul>
              {error && (
                <p className="text-sm text-destructive flex items-center gap-2">
                  <AlertTriangle size={14} />
                  {error}
                </p>
              )}
            </div>
          )}

          {/* ── Step: done ── */}
          {step === 'done' && (
            <div className="text-center py-6 space-y-3">
              <div className="w-14 h-14 rounded-full bg-green-50 dark:bg-green-500/15 flex items-center justify-center mx-auto">
                <CheckCircle2 size={28} className="text-green-500 dark:text-green-400" />
              </div>
              <p className="text-lg font-semibold">Import complete!</p>
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground tabular-nums">{importedCount}</strong> contacts were added to your workspace.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'done' && (
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border flex-shrink-0 bg-card">
            <Button
              variant="ghost"
              size="sm"
              onClick={step === 'upload' ? onClose : () => setStep(step === 'confirm' ? 'map' : 'upload')}
            >
              {step === 'upload' ? 'Cancel' : 'Back'}
            </Button>
            {step === 'upload' && (
              <Button size="sm" disabled onClick={() => {}}>
                Next
              </Button>
            )}
            {step === 'map' && (
              <Button
                size="sm"
                disabled={!hasNameMapping || importRows.length === 0}
                onClick={() => setStep('confirm')}
              >
                Next — {importRows.length} rows
              </Button>
            )}
            {step === 'confirm' && (
              <Button size="sm" onClick={handleImport} disabled={importing}>
                {importing ? 'Importing…' : `Import ${importRows.length} contacts`}
              </Button>
            )}
          </div>
        )}
        {step === 'done' && (
          <div className="flex justify-center px-6 py-4 border-t border-border flex-shrink-0">
            <Button onClick={onClose}>Done</Button>
          </div>
        )}
      </div>
    </div>
  );
}
