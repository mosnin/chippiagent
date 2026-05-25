'use client';

import { useState, useRef } from 'react';
import { Upload, File, Loader2, X, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DocumentUploadProps {
  contactId: string;
  uploadedBy?: string;
  onUploaded?: () => void;
}

interface UploadedDoc {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export function DocumentUpload({ contactId, uploadedBy = 'guest', onUploaded }: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploads, setUploads] = useState<UploadedDoc[]>([]);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large (max 10MB)');
      return;
    }

    setUploading(true);
    setError('');

    const formData = new FormData();
    formData.append('contactId', contactId);
    formData.append('file', file);
    formData.append('uploadedBy', uploadedBy);

    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const doc = await res.json();
        setUploads((prev) => [...prev, doc]);
        onUploaded?.();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Upload didn't go through. Try again.");
      }
    } catch {
      setError("I lost the connection. Try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    if (inputRef.current) inputRef.current.value = '';
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30 hover:bg-muted/30',
          uploading && 'pointer-events-none opacity-60'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
          onChange={handleChange}
        />
        {uploading ? (
          <Loader2 size={24} className="mx-auto animate-spin text-primary mb-2" />
        ) : (
          <Upload size={24} className="mx-auto text-muted-foreground mb-2" />
        )}
        <p className="text-sm font-medium">
          {uploading ? 'Uploading...' : 'Drop files here or click to upload'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF, images, or Word documents (max 10MB)
        </p>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Uploaded files */}
      {uploads.length > 0 && (
        <div className="space-y-1.5">
          {uploads.map((doc) => (
            <div key={doc.id} className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <File size={14} className="text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-medium truncate flex-1">{doc.fileName}</span>
              <span className="text-[10px] text-muted-foreground">{formatSize(doc.fileSize)}</span>
              <CheckCircle2 size={12} className="text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
