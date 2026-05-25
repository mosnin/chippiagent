'use client';

/**
 * FilesPanel — the interactive surface of /s/[slug]/files. Renders:
 *
 *   1. A quota gauge (used vs. plan total)
 *   2. Category tabs (All / Images / Documents / Videos / Audio)
 *   3. A drag-drop dropzone + file picker
 *   4. A grid of file cards (image thumbnails when isPublic; icon + name
 *      otherwise — private files use a signed-URL fetch on Download click)
 *
 * Limits + quota enforcement live server-side in /api/files. The UI
 * mirrors the cap labels client-side as a courtesy ("Max 25 MB for PDFs")
 * but never trusts them as the source of truth.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Upload,
  Trash2,
  Download,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes, type FileCategory } from '@/lib/storage/limits';

interface FileRow {
  id: string;
  name: string;
  mimeType: string;
  category: FileCategory;
  sizeBytes: number;
  isPublic: boolean;
  createdAt: string;
  /** Where the file came from. 'chat' rows are read-only here; manage them
   *  by removing the attachment inside the Chippi conversation. */
  source: 'file' | 'chat';
}

interface Quota {
  planId: string;
  totalBytes: number;
  usedBytes: number;
  remainingBytes: number;
  label: string;
}

type Tab = 'all' | FileCategory;

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  { id: 'all', label: 'All', icon: FileText },
  { id: 'image', label: 'Images', icon: ImageIcon },
  { id: 'document', label: 'Documents', icon: FileText },
  { id: 'video', label: 'Videos', icon: Film },
  { id: 'audio', label: 'Audio', icon: Music },
];

const CATEGORY_ICON: Record<FileCategory, React.ComponentType<{ size?: number; className?: string }>> = {
  image: ImageIcon,
  document: FileText,
  video: Film,
  audio: Music,
  other: FileText,
};

export function FilesPanel() {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/files');
      if (!res.ok) throw new Error('Failed to load files');
      const data = await res.json();
      setFiles(data.files ?? []);
      setQuota(data.quota ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const uploadOne = useCallback(
    async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/files', { method: 'POST', body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Upload failed');
      }
    },
    [],
  );

  const handleFiles = useCallback(
    async (incoming: File[]) => {
      setUploading(true);
      setError(null);
      try {
        for (const f of incoming) {
          // eslint-disable-next-line no-await-in-loop
          await uploadOne(f);
        }
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [uploadOne, refresh],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const dropped = Array.from(e.dataTransfer.files ?? []);
      if (dropped.length > 0) void handleFiles(dropped);
    },
    [handleFiles],
  );

  const onDelete = useCallback(
    async (file: FileRow) => {
      const endpoint =
        file.source === 'chat'
          ? `/api/ai/attachments?id=${encodeURIComponent(file.id)}`
          : `/api/files/${file.id}`;
      const res = await fetch(endpoint, { method: 'DELETE' });
      if (res.ok) await refresh();
    },
    [refresh],
  );

  const onDownload = useCallback(async (file: FileRow) => {
    // Chat attachments are already public — fetch the row to get the URL.
    // Files use a signed-URL endpoint that returns a 5-min download link.
    const endpoint =
      file.source === 'chat'
        ? `/api/ai/attachments?id=${encodeURIComponent(file.id)}`
        : `/api/files/${file.id}`;
    const res = await fetch(endpoint);
    if (!res.ok) return;
    const body = (await res.json()) as { url?: string; publicUrl?: string };
    const url = body.url ?? body.publicUrl;
    if (url) window.open(url, '_blank', 'noopener');
  }, []);

  const visibleFiles = useMemo(() => {
    if (tab === 'all') return files;
    return files.filter((f) => f.category === tab);
  }, [files, tab]);

  const usedPercent = useMemo(() => {
    if (!quota || quota.totalBytes === 0) return 0;
    return Math.min(100, Math.round((quota.usedBytes / quota.totalBytes) * 100));
  }, [quota]);

  return (
    <div
      className="space-y-6"
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={onDrop}
    >
      {/* Quota gauge */}
      {quota && (
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {formatBytes(quota.usedBytes)} of {quota.label} used
            </span>
            <span
              className={cn(
                'font-medium tabular-nums',
                usedPercent >= 90
                  ? 'text-rose-600 dark:text-rose-400'
                  : usedPercent >= 70
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-foreground',
              )}
            >
              {usedPercent}%
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full transition-all',
                usedPercent >= 90
                  ? 'bg-rose-500/80'
                  : usedPercent >= 70
                    ? 'bg-amber-500/80'
                    : 'bg-emerald-500/80',
              )}
              style={{ width: `${usedPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Tabs + Upload button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-[12.5px] font-medium transition-colors',
                  active
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
                )}
              >
                <Icon size={12} />
                {t.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 h-9 text-[13px] font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          Upload
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            if (picked.length > 0) void handleFiles(picked);
            e.target.value = '';
          }}
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-50/70 dark:bg-rose-500/5 px-3 py-2 flex items-start gap-2 text-[12.5px] text-rose-700 dark:text-rose-400">
          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-rose-700/70 dark:text-rose-400/70 hover:text-rose-700 dark:hover:text-rose-400"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Drop overlay */}
      {dragActive && (
        <div className="pointer-events-none fixed inset-0 z-50 bg-foreground/5 backdrop-blur-sm flex items-center justify-center">
          <div className="rounded-xl border-2 border-dashed border-foreground/40 bg-background px-8 py-6 text-center">
            <Upload className="w-8 h-8 mx-auto text-foreground/60" />
            <p className="mt-2 text-sm font-medium text-foreground">Drop to upload</p>
          </div>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="text-sm text-muted-foreground py-12 text-center">Loading…</div>
      ) : visibleFiles.length === 0 ? (
        <EmptyState onPick={() => inputRef.current?.click()} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {visibleFiles.map((file) => (
            <FileCard key={file.id} file={file} onDelete={onDelete} onDownload={onDownload} />
          ))}
        </div>
      )}
    </div>
  );
}

function FileCard({
  file,
  onDelete,
  onDownload,
}: {
  file: FileRow;
  onDelete: (file: FileRow) => void;
  onDownload: (file: FileRow) => void;
}) {
  const Icon = CATEGORY_ICON[file.category];
  return (
    <div className="group relative rounded-xl border border-border/60 bg-card overflow-hidden hover:border-border transition-colors">
      <div className="aspect-square bg-muted/30 flex items-center justify-center">
        <Icon className="w-8 h-8 text-muted-foreground/60" />
      </div>
      <div className="p-2.5 space-y-0.5">
        <p className="text-[12px] font-medium text-foreground truncate" title={file.name}>
          {file.name}
        </p>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10.5px] text-muted-foreground tabular-nums">
            {formatBytes(file.sizeBytes)}
          </p>
          {file.source === 'chat' && (
            <span
              title="Uploaded inside a Chippi conversation"
              className="text-[9px] uppercase tracking-wider font-medium px-1.5 py-px rounded-full bg-foreground/[0.06] text-foreground/55"
            >
              Chat
            </span>
          )}
        </div>
      </div>
      <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onDownload(file)}
          title="Download"
          className="w-7 h-7 rounded-md bg-background/90 backdrop-blur-sm text-foreground/70 hover:text-foreground flex items-center justify-center border border-border/60"
        >
          <Download size={12} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete "${file.name}"?`)) onDelete(file);
          }}
          title="Delete"
          className="w-7 h-7 rounded-md bg-background/90 backdrop-blur-sm text-rose-600 dark:text-rose-400 hover:bg-rose-500/15 flex items-center justify-center border border-rose-500/30"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="w-full rounded-xl border-2 border-dashed border-border/60 bg-card hover:bg-muted/20 hover:border-border transition-colors py-12 px-6 flex flex-col items-center text-center"
    >
      <Upload className="w-7 h-7 text-muted-foreground/60" />
      <p className="mt-3 text-sm font-medium text-foreground">Drop files here</p>
      <p className="mt-1 text-[12px] text-muted-foreground max-w-sm">
        Images, PDFs, videos, audio — up to 10 MB images / 25 MB PDFs / 200 MB videos / 50 MB audio.
      </p>
    </button>
  );
}
