'use client';

/**
 * DocumentsPanel — list + editor for the realtor's own documents.
 *
 * A document is a file the realtor authored in-app. Two modes, swapped in
 * place (no routing): a divide-y list of documents, and a plain editor for
 * one. Chippi can read and attach these, but the realtor is always the
 * author — nothing here is machine-written.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  FileText,
  Plus,
  ArrowLeft,
  Trash2,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface DocRow {
  id: string;
  title: string;
  sizeBytes: number;
  createdAt: string;
}

interface Draft {
  id?: string;
  title: string;
  content: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function DocumentsPanel() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/files/documents');
      if (!res.ok) throw new Error('Failed to load documents');
      const data = await res.json();
      setDocs(data.documents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openNew = useCallback(() => {
    setError(null);
    setDraft({ title: '', content: '' });
    setMode('edit');
  }, []);

  const openDoc = useCallback(async (id: string) => {
    setError(null);
    setOpening(true);
    try {
      const res = await fetch(`/api/files/documents/${id}`);
      if (!res.ok) throw new Error('Failed to open document');
      const data = await res.json();
      setDraft({ id: data.id, title: data.title ?? '', content: data.content ?? '' });
      setMode('edit');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open document');
    } finally {
      setOpening(false);
    }
  }, []);

  const backToList = useCallback(() => {
    setMode('list');
    setDraft(null);
    setError(null);
  }, []);

  const save = useCallback(async () => {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) {
      setError('Give the document a title.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        draft.id ? `/api/files/documents/${draft.id}` : '/api/files/documents',
        {
          method: draft.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content: draft.content }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Could not save the document');
      }
      await refresh();
      backToList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the document');
    } finally {
      setSaving(false);
    }
  }, [draft, refresh, backToList]);

  const remove = useCallback(
    async (id: string, title: string) => {
      if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
      try {
        const res = await fetch(`/api/files/documents/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Could not delete the document');
        await refresh();
        backToList();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not delete the document');
      }
    },
    [refresh, backToList],
  );

  // ── Editor ────────────────────────────────────────────────────────────────
  if (mode === 'edit' && draft) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={backToList}
            className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={14} />
            All documents
          </button>
          <div className="flex items-center gap-2">
            {draft.id && (
              <button
                type="button"
                onClick={() => remove(draft.id as string, draft.title)}
                className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 px-3 h-9 text-[13px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                <Trash2 size={13} />
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 h-9 text-[13px] font-semibold text-background hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              {draft.id ? 'Save changes' : 'Save document'}
            </button>
          </div>
        </div>

        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        <input
          type="text"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="Document title"
          aria-label="Document title"
          maxLength={200}
          className="w-full bg-transparent text-xl font-semibold text-foreground placeholder:text-muted-foreground/60 outline-none"
        />
        <textarea
          value={draft.content}
          onChange={(e) => setDraft({ ...draft, content: e.target.value })}
          placeholder="Write or paste your document here…"
          aria-label="Document content"
          className="w-full min-h-[60vh] rounded-md border border-input bg-transparent px-3.5 py-3 text-base sm:text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background transition-colors resize-y"
        />
        <p className="text-[11px] text-muted-foreground">
          Saved to your documents. Chippi can read it and attach it to a deal — it won&apos;t change your wording.
        </p>
      </div>
    );
  }

  // ── List ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {loading
            ? 'Loading…'
            : `${docs.length} document${docs.length === 1 ? '' : 's'}`}
        </p>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 h-9 text-[13px] font-semibold text-background hover:opacity-90 transition-opacity"
        >
          <Plus size={14} />
          New document
        </button>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-12 text-center">
          <FileText className="mx-auto h-7 w-7 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-foreground">No documents yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Write one from scratch, or paste in content you already have.
          </p>
          <button
            type="button"
            onClick={openNew}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-3.5 h-8 text-[12.5px] font-medium text-foreground hover:bg-muted/40 transition-colors"
          >
            <Plus size={13} />
            New document
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {docs.map((doc) => (
            <li key={doc.id}>
              <button
                type="button"
                onClick={() => openDoc(doc.id)}
                disabled={opening}
                className="group flex w-full items-center gap-3 py-3 text-left disabled:opacity-60"
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-muted/50">
                  <FileText size={15} className="text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {doc.title}
                  </span>
                  <span className="block text-[11px] tabular-nums text-muted-foreground">
                    {formatDate(doc.createdAt)}
                  </span>
                </span>
                <span className="text-[12px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  Open
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-50/70 dark:bg-rose-500/5 px-3 py-2 text-[12.5px] text-rose-700 dark:text-rose-400">
      <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-auto text-rose-700/70 hover:text-rose-700 dark:text-rose-400/70 dark:hover:text-rose-400"
      >
        Dismiss
      </button>
    </div>
  );
}
