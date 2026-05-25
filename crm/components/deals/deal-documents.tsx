'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, FileText, Download, Trash2, Loader2, ArrowUpFromLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DEAL_DOCUMENT_KINDS,
  defaultDocumentKind,
  documentKindsForPipeline,
  documentKindLabel,
  formatFileSize,
  type DealDocument,
  type DealDocumentKind,
} from '@/lib/deals/documents';

interface DealDocumentsProps {
  dealId: string;
  initial?: DealDocument[];
  pipelineType?: string | null;
}

/**
 * Document library for a single deal. Drop zone + kind picker + list with
 * signed-URL download. Deliberately minimal — the win here is having a
 * typed, labeled place to store these files at all, not a full DMS.
 */
export function DealDocuments({ dealId, initial = [], pipelineType }: DealDocumentsProps) {
  const [docs, setDocs] = useState<DealDocument[]>(initial);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedKind, setSelectedKind] = useState<DealDocumentKind>(() => defaultDocumentKind(pipelineType));
  const orderedKinds = documentKindsForPipeline(pipelineType);
  const sortedKinds = DEAL_DOCUMENT_KINDS.slice().sort(
    (a, b) => orderedKinds.indexOf(a.value) - orderedKinds.indexOf(b.value),
  );
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initial.length > 0) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/deals/${dealId}/documents`);
        if (!res.ok) return;
        const data: DealDocument[] = await res.json();
        if (!cancelled) setDocs(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [dealId, initial.length]);

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', selectedKind);
      fd.append('label', file.name);

      const res = await fetch(`/api/deals/${dealId}/documents`, { method: 'POST', body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Upload didn't go through. Try again.");
        return;
      }
      const created: DealDocument = await res.json();
      setDocs((prev) => [created, ...prev]);
      toast.success(`${file.name} uploaded.`);
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(doc: DealDocument) {
    const res = await fetch(`/api/deals/${dealId}/documents/${doc.id}`);
    if (!res.ok) {
      toast.error("Couldn't open that download link.");
      return;
    }
    const { url } = await res.json();
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleDelete(doc: DealDocument) {
    const prev = docs;
    setDocs((list) => list.filter((d) => d.id !== doc.id));
    const res = await fetch(`/api/deals/${dealId}/documents/${doc.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setDocs(prev);
      toast.error("Couldn't delete that.");
    }
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!dragging) setDragging(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
  }
  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    for (const f of files) await uploadFile(f);
  }

  return (
    <div className="space-y-4">
      {/* Drop zone + kind picker */}
      <div
        className={cn(
          'rounded-lg border-2 border-dashed px-4 py-6 transition-colors',
          dragging ? 'border-foreground bg-muted/40' : 'border-border bg-muted/10',
        )}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
            {uploading ? <Loader2 size={18} className="animate-spin text-muted-foreground" /> : <ArrowUpFromLine size={18} className="text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Drag files here or click to upload</p>
            <p className="text-xs text-muted-foreground">PDF, image, or Word — 25MB max.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <label className="sr-only" htmlFor="deal-doc-kind">Document type</label>
            <select
              id="deal-doc-kind"
              value={selectedKind}
              onChange={(e) => setSelectedKind(e.target.value as DealDocumentKind)}
              className="text-xs border border-border rounded px-2 py-1.5 bg-card"
              disabled={uploading}
            >
              {sortedKinds.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground text-background text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
            >
              <Upload size={12} />
              Choose file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f);
                // Reset so the same filename can be picked again.
                e.target.value = '';
              }}
            />
          </div>
        </div>
      </div>

      {/* Document list */}
      {loading && docs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">One moment.</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nothing here yet. Drop the offer in to start.
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-card">
          {docs.map((doc) => (
            <li key={doc.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
              <FileText size={18} className="text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{doc.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {documentKindLabel(doc.kind)}
                  {doc.sizeBytes ? ` · ${formatFileSize(doc.sizeBytes)}` : ''}
                  {' · '}
                  {new Date(doc.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDownload(doc)}
                className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                title={`Download ${doc.label}`}
              >
                <Download size={13} />
                Download
              </button>
              <button
                type="button"
                onClick={() => handleDelete(doc)}
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                title={`Delete ${doc.label}`}
                aria-label={`Delete ${doc.label}`}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
