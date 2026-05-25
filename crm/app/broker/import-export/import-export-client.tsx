'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export default function ImportExportClient({ totalLeads }: { totalLeads: number }) {
  // Export state
  const [exporting, setExporting] = useState(false);

  // Import state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/broker/leads/export');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      a.download = filenameMatch?.[1] ?? `leads_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  // ── Import ─────────────────────────────────────────────────────────────────
  const handleFileSelect = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setImportError('Please select a CSV file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImportError('File is too large. Maximum size is 5MB.');
      return;
    }
    setSelectedFile(file);
    setImportError(null);
    setImportResult(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/broker/leads/import', {
        method: 'POST',
        body: formData,
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || 'Import failed');
      }

      setImportResult(body as ImportResult);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setImportError(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import / Export</h1>
        <p className="text-muted-foreground mt-1">
          Import leads from a CSV file or export all brokerage leads.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Export Section ─────────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-500/10">
                <Download className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Export Leads</h2>
                <p className="text-sm text-muted-foreground">
                  Download all leads as a CSV file
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4 mb-4">
              <p className="text-sm">
                <span className="font-medium">{totalLeads.toLocaleString()}</span>{' '}
                {totalLeads === 1 ? 'lead' : 'leads'} will be exported across all team members.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Includes name, email, phone, lead type, budget, score, status, address, notes,
                and assignment info.
              </p>
            </div>

            <Button
              onClick={handleExport}
              disabled={exporting || totalLeads === 0}
              className="w-full"
            >
              {exporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export all leads
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* ── Import Section ─────────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/10">
                <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Import Leads</h2>
                <p className="text-sm text-muted-foreground">
                  Upload a CSV file to create new leads
                </p>
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors ${
                dragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground/60 mb-2" />
              {selectedFile ? (
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{selectedFile.name}</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearFile();
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm font-medium">
                    Drop a CSV file here or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Maximum 5MB, up to 1,000 rows
                  </p>
                </>
              )}
            </div>

            {/* Upload button */}
            <Button
              onClick={handleImport}
              disabled={!selectedFile || importing}
              className="w-full mt-4"
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload and import
                </>
              )}
            </Button>

            {/* Import result */}
            {importResult && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                    Import complete
                  </p>
                </div>
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  <span className="font-semibold">{importResult.imported}</span> imported,{' '}
                  <span className="font-semibold">{importResult.skipped}</span> skipped
                </p>
                {importResult.errors.length > 0 && (
                  <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
                    {importResult.errors.map((err, i) => (
                      <p key={i} className="text-xs text-amber-700 dark:text-amber-400">
                        {err}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Import error */}
            {importError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <p className="text-sm text-red-700 dark:text-red-400">{importError}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* CSV Format Instructions */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-base font-semibold mb-2">CSV Format</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Your CSV file should include a header row followed by data rows. Required fields:{' '}
            <span className="font-medium text-foreground">Name</span>, and at least one of{' '}
            <span className="font-medium text-foreground">Email</span> or{' '}
            <span className="font-medium text-foreground">Phone</span>.
          </p>

          <div className="rounded-lg border bg-muted/30 p-4 overflow-x-auto">
            <p className="text-xs font-medium text-muted-foreground mb-2">Example:</p>
            <pre className="text-xs leading-relaxed whitespace-pre font-mono">
{`Name,Email,Phone,Lead Type,Budget,Property Address,Notes,Move-in Date,Assign To
John Smith,john@example.com,+15551234567,rental,2500,123 Main St,Looking for 2BR,2026-05-01,agent@example.com
Jane Doe,jane@example.com,+15559876543,buyer,350000,,,ASAP,`}
            </pre>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">Required columns</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                <li><span className="font-medium text-foreground">Name</span> — contact name</li>
                <li><span className="font-medium text-foreground">Email</span> and/or <span className="font-medium text-foreground">Phone</span> — at least one required</li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">Optional columns</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                <li><span className="font-medium text-foreground">Lead Type</span> — &quot;rental&quot; (default) or &quot;buyer&quot;</li>
                <li><span className="font-medium text-foreground">Budget</span> — numeric value</li>
                <li><span className="font-medium text-foreground">Property Address</span> — property address</li>
                <li><span className="font-medium text-foreground">Notes</span> — additional notes</li>
                <li><span className="font-medium text-foreground">Move-in Date</span> — target date</li>
                <li><span className="font-medium text-foreground">Assign To</span> — member email address</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
