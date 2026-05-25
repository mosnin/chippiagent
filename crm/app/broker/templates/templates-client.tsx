'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Copy,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TemplateCategory = 'follow-up' | 'intro' | 'closing' | 'tour-invite';
type TemplateChannel = 'sms' | 'email' | 'note';

type BrokerageTemplate = {
  id: string;
  brokerageId: string;
  name: string;
  category: TemplateCategory;
  channel: TemplateChannel;
  subject: string | null;
  body: string;
  version: number;
  publishedAt: string | null;
  publishedVersion: number | null;
  publishedCount: number;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

type PublishResponse = {
  pushed: number;
  skipped: number;
  publishedAt: string;
};

type EditorMode = { kind: 'create' } | { kind: 'edit'; template: BrokerageTemplate };

type EditorForm = {
  name: string;
  category: TemplateCategory;
  channel: TemplateChannel;
  subject: string;
  body: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NAME_MAX = 100;
const BODY_MAX = 5000;

const CATEGORY_ORDER: TemplateCategory[] = ['follow-up', 'intro', 'closing', 'tour-invite'];

const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  'follow-up': 'Follow-up',
  intro: 'Intro',
  closing: 'Closing',
  'tour-invite': 'Tour invite',
};

const CHANNEL_LABEL: Record<TemplateChannel, string> = {
  sms: 'SMS',
  email: 'Email',
  note: 'Note',
};

const CHANNEL_CHIP_CLASS: Record<TemplateChannel, string> = {
  sms: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  email: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400',
  note: 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Inline relative-time helper using Intl.RelativeTimeFormat.
const REL_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31536000], ['month', 2592000], ['week', 604800],
  ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1],
];
function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return 'never';
  const diffSec = Math.round((target - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, secs] of REL_UNITS) {
    if (abs >= secs || unit === 'second') {
      return rtf.format(Math.round(diffSec / secs), unit);
    }
  }
  return rtf.format(diffSec, 'second');
}

function previewBody(body: string): string {
  const clipped = body.length > 120 ? body.slice(0, 120).trimEnd() + '…' : body;
  return clipped;
}

type PublishStatus = 'up-to-date' | 'edited' | 'never';

// The earlier version of this function compared updatedAt against publishedAt
// with a 1-second slack; audit found that (a) a PATCH within 1s of a publish
// read as green, and (b) even modest client/server clock skew broke the
// heuristic. We now compare the published version against the current
// version directly — the BP6 audit follow-up migration adds
// publishedVersion to the row, set by the publish route at stamp time.
function publishStatus(t: BrokerageTemplate): PublishStatus {
  if (!t.publishedAt || t.publishedVersion == null) return 'never';
  return t.version > t.publishedVersion ? 'edited' : 'up-to-date';
}

function statusMeta(status: PublishStatus): { dot: string; label: string } {
  switch (status) {
    case 'up-to-date':
      return { dot: 'bg-emerald-500', label: 'Up to date with agents' };
    case 'edited':
      return { dot: 'bg-amber-500', label: 'Edited since last publish' };
    case 'never':
      return { dot: 'bg-muted-foreground/40', label: 'Never published' };
  }
}

function emptyForm(): EditorForm {
  return { name: '', category: 'follow-up', channel: 'sms', subject: '', body: '' };
}

function formFromTemplate(t: BrokerageTemplate): EditorForm {
  return {
    name: t.name,
    category: t.category,
    channel: t.channel,
    subject: t.subject ?? '',
    body: t.body,
  };
}

// ---------------------------------------------------------------------------
// Main client
// ---------------------------------------------------------------------------

export default function TemplatesClient() {
  const [templates, setTemplates] = useState<BrokerageTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>({ kind: 'create' });
  const [form, setForm] = useState<EditorForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [publishTarget, setPublishTarget] = useState<BrokerageTemplate | null>(null);
  const [publishing, setPublishing] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<BrokerageTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Separate "initial load failed" from the templates list itself so the UI
  // can offer a retry button instead of leaving the broker staring at an
  // empty page after a transient network error (audit finding).
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/broker/templates', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load templates');
      const data = (await res.json()) as BrokerageTemplate[];
      setTemplates(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load templates';
      toast.error(msg);
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  // -------------------------------------------------------------------------
  // Editor dialog
  // -------------------------------------------------------------------------

  function openCreate() {
    setEditorMode({ kind: 'create' });
    setForm(emptyForm());
    setEditorOpen(true);
  }

  function openEdit(t: BrokerageTemplate) {
    setEditorMode({ kind: 'edit', template: t });
    setForm(formFromTemplate(t));
    setEditorOpen(true);
  }

  function closeEditor() {
    if (saving) return;
    setEditorOpen(false);
  }

  function validateForm(): string | null {
    if (!form.name.trim()) return 'Name is required';
    if (form.name.length > NAME_MAX) return `Name must be ${NAME_MAX} characters or fewer`;
    if (!form.body.trim()) return 'Body is required';
    if (form.body.length > BODY_MAX) return `Body must be ${BODY_MAX} characters or fewer`;
    return null;
  }

  async function saveOnly(): Promise<BrokerageTemplate | null> {
    const err = validateForm();
    if (err) {
      toast.error(err);
      return null;
    }

    const payload = {
      name: form.name.trim(),
      category: form.category,
      channel: form.channel,
      subject: form.channel === 'email' ? (form.subject.trim() || null) : null,
      body: form.body,
    };

    const url =
      editorMode.kind === 'edit'
        ? `/api/broker/templates/${editorMode.template.id}`
        : '/api/broker/templates';
    const method = editorMode.kind === 'edit' ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data: unknown = await res.json().catch(() => ({}));
      const msg =
        typeof data === 'object' && data !== null && 'error' in data
          ? String((data as { error?: unknown }).error)
          : 'Failed to save template';
      throw new Error(msg);
    }
    const saved = (await res.json()) as BrokerageTemplate;
    setTemplates((prev) => {
      const without = prev.filter((p) => p.id !== saved.id);
      return [saved, ...without].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    });
    return saved;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await saveOnly();
      if (saved) {
        toast.success(editorMode.kind === 'edit' ? 'Template updated' : 'Template created');
        setEditorOpen(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndPublish() {
    setSaving(true);
    try {
      const saved = await saveOnly();
      if (!saved) return;
      toast.success('Template saved');
      setEditorOpen(false);
      // Open the publish confirmation for the freshly saved row.
      setPublishTarget(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Publish
  // -------------------------------------------------------------------------

  async function confirmPublish() {
    if (!publishTarget) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/broker/templates/${publishTarget.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => ({}));
        const msg =
          typeof data === 'object' && data !== null && 'error' in data
            ? String((data as { error?: unknown }).error)
            : 'Failed to publish';
        throw new Error(msg);
      }
      const result = (await res.json()) as PublishResponse;
      toast.success(
        `Pushed to ${result.pushed} agent${result.pushed === 1 ? '' : 's'}. ` +
          `${result.skipped} skipped (local edits).`,
      );
      setPublishTarget(null);
      await loadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setPublishing(false);
    }
  }

  // -------------------------------------------------------------------------
  // Duplicate
  // -------------------------------------------------------------------------

  async function handleDuplicate(t: BrokerageTemplate) {
    try {
      const res = await fetch('/api/broker/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${t.name} (copy)`,
          category: t.category,
          channel: t.channel,
          subject: t.subject,
          body: t.body,
        }),
      });
      if (!res.ok) throw new Error('Failed to duplicate');
      const copy = (await res.json()) as BrokerageTemplate;
      setTemplates((prev) => [copy, ...prev]);
      toast.success('Template duplicated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to duplicate');
    }
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/broker/templates/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error('Failed to delete');
      setTemplates((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      toast.success('Template deleted');
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Derived groups
  // -------------------------------------------------------------------------

  const grouped = useMemo(() => {
    const byCat: Record<TemplateCategory, BrokerageTemplate[]> = {
      'follow-up': [],
      intro: [],
      closing: [],
      'tour-invite': [],
    };
    for (const t of templates) byCat[t.category]?.push(t);
    return byCat;
  }, [templates]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Template library</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Share message templates across your team and publish new versions to every agent.
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus size={15} />
          New template
        </Button>
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : loadError ? (
        <LoadErrorState message={loadError} onRetry={() => { setLoading(true); void loadTemplates(); }} />
      ) : templates.length === 0 ? (
        <EmptyState onCreate={openCreate} />
      ) : (
        <div className="space-y-8">
          {CATEGORY_ORDER.map((cat) => {
            const items = grouped[cat];
            if (items.length === 0) return null;
            return (
              <section key={cat} className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {CATEGORY_LABEL[cat]}
                  <span className="ml-2 text-xs font-normal text-muted-foreground/70">
                    {items.length}
                  </span>
                </h2>
                <div className="grid gap-3">
                  {items.map((t) => (
                    <TemplateCard
                      key={t.id}
                      template={t}
                      onEdit={() => openEdit(t)}
                      onPublish={() => setPublishTarget(t)}
                      onDuplicate={() => handleDuplicate(t)}
                      onDelete={() => setDeleteTarget(t)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <EditorDialog
        open={editorOpen}
        mode={editorMode}
        form={form}
        setForm={setForm}
        saving={saving}
        onClose={closeEditor}
        onSave={handleSave}
        onSaveAndPublish={handleSaveAndPublish}
      />

      <PublishConfirmDialog
        target={publishTarget}
        busy={publishing}
        onCancel={() => (publishing ? undefined : setPublishTarget(null))}
        onConfirm={confirmPublish}
      />

      <DeleteConfirmDialog
        target={deleteTarget}
        busy={deleting}
        onCancel={() => (deleting ? undefined : setDeleteTarget(null))}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

type TemplateCardProps = {
  template: BrokerageTemplate;
  onEdit: () => void;
  onPublish: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

function TemplateCard({ template: t, onEdit, onPublish, onDuplicate, onDelete }: TemplateCardProps) {
  const status = publishStatus(t);
  const meta = statusMeta(status);

  return (
    <Card>
      <CardContent className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                aria-label={meta.label}
                title={meta.label}
                className={`inline-block size-2 rounded-full ${meta.dot}`}
              />
              <p className="text-sm font-semibold truncate">{t.name}</p>
              <Badge variant="secondary" className={CHANNEL_CHIP_CLASS[t.channel]}>
                {CHANNEL_LABEL[t.channel]}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-mono">
                v{t.version}
              </Badge>
            </div>

            {t.channel === 'email' && t.subject && (
              <p className="text-xs text-muted-foreground truncate">
                <span className="font-medium">Subject:</span> {t.subject}
              </p>
            )}

            <p className="text-xs text-muted-foreground/90 font-mono whitespace-pre-wrap line-clamp-3">
              {previewBody(t.body)}
            </p>

            <div className="text-[11px] text-muted-foreground/70 flex items-center gap-2 flex-wrap">
              {t.publishedAt ? (
                <>
                  <span>Last published {formatRelative(t.publishedAt)}</span>
                  {t.publishedCount > 0 && (
                    <>
                      <span aria-hidden className="text-muted-foreground/40">
                        ·
                      </span>
                      <span>
                        pushed to {t.publishedCount} agent{t.publishedCount === 1 ? '' : 's'}
                      </span>
                    </>
                  )}
                </>
              ) : (
                <span>Never published</span>
              )}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${t.name}`}
                className="shrink-0"
              >
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil size={14} />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onPublish}>
                <Send size={14} />
                Publish to agents
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDuplicate}>
                <Copy size={14} />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onDelete} variant="destructive">
                <Trash2 size={14} />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Editor dialog
// ---------------------------------------------------------------------------

type EditorDialogProps = {
  open: boolean;
  mode: EditorMode;
  form: EditorForm;
  setForm: (updater: (prev: EditorForm) => EditorForm) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onSaveAndPublish: () => void;
};

function EditorDialog({
  open,
  mode,
  form,
  setForm,
  saving,
  onClose,
  onSave,
  onSaveAndPublish,
}: EditorDialogProps) {
  const title = mode.kind === 'edit' ? 'Edit template' : 'New template';
  const description =
    mode.kind === 'edit'
      ? 'Content changes will bump the version when saved.'
      : 'This template will be available to your team once saved.';

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="tmpl-name">Name</Label>
              <span className="text-[11px] text-muted-foreground">
                {form.name.length}/{NAME_MAX}
              </span>
            </div>
            <Input
              id="tmpl-name"
              value={form.name}
              maxLength={NAME_MAX}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Initial follow-up"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tmpl-category">Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, category: v as TemplateCategory }))
                }
              >
                <SelectTrigger id="tmpl-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_ORDER.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tmpl-channel">Channel</Label>
              <Select
                value={form.channel}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, channel: v as TemplateChannel }))
                }
              >
                <SelectTrigger id="tmpl-channel" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.channel === 'email' && (
            <div className="space-y-1.5">
              <Label htmlFor="tmpl-subject">Subject</Label>
              <Input
                id="tmpl-subject"
                value={form.subject}
                onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                placeholder="e.g. Following up on your tour"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="tmpl-body">Body</Label>
              <span className="text-[11px] text-muted-foreground">
                {form.body.length}/{BODY_MAX}
              </span>
            </div>
            <Textarea
              id="tmpl-body"
              value={form.body}
              maxLength={BODY_MAX}
              onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
              rows={8}
              placeholder={
                'Hi {{name}},\n\nThanks for your interest in {{property}}. ' +
                "I'd love to schedule a tour at your convenience.\n\nBest"
              }
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Use {'{{name}}'}, {'{{property}}'}, {'{{budget}}'} as placeholders.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="outline" onClick={onSaveAndPublish} disabled={saving}>
            Save & publish to agents
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Publish confirm
// ---------------------------------------------------------------------------

type PublishConfirmDialogProps = {
  target: BrokerageTemplate | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function PublishConfirmDialog({ target, busy, onCancel, onConfirm }: PublishConfirmDialogProps) {
  const open = target !== null;
  const agents = target?.publishedCount ?? 0;
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onCancel() : null)}>
      <DialogContent className="sm:max-w-md" role="alertdialog">
        <DialogHeader>
          <DialogTitle>Push to agents?</DialogTitle>
          <DialogDescription>
            {target ? (
              <>
                Push <span className="font-medium text-foreground">&lsquo;{target.name}&rsquo;</span> to{' '}
                {agents > 0
                  ? `${agents} agent${agents === 1 ? '' : 's'}`
                  : 'your team'}
                ? Agents who&apos;ve edited their copy locally will keep their version.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          {/* autoFocus so keyboard users can confirm from the dropdown
              without grabbing the mouse — the DropdownMenu grabs focus on
              open, and without this the tab order drops back to <body>. */}
          <Button onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? 'Publishing…' : 'Publish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete confirm
// ---------------------------------------------------------------------------

type DeleteConfirmDialogProps = {
  target: BrokerageTemplate | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function DeleteConfirmDialog({ target, busy, onCancel, onConfirm }: DeleteConfirmDialogProps) {
  const open = target !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onCancel() : null)}>
      <DialogContent className="sm:max-w-md" role="alertdialog">
        <DialogHeader>
          <DialogTitle>Delete template?</DialogTitle>
          <DialogDescription>
            {target ? (
              <>
                Delete <span className="font-medium text-foreground">&lsquo;{target.name}&rsquo;</span>?
                Agents who already have a copy will keep theirs as a local template.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy} autoFocus>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Loading + empty
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-8" aria-busy>
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <div className="grid gap-3">
            {[0, 1].map((j) => (
              <Card key={j}>
                <CardContent className="px-5 py-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-2 rounded-full" />
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-5 w-12 rounded-full" />
                    <Skeleton className="h-5 w-8 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="px-5 py-12 text-center space-y-3">
        <p className="text-sm font-medium text-foreground">Couldn&apos;t load templates</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card>
      <CardContent className="px-5 py-12 text-center space-y-3">
        <FileText size={28} className="mx-auto text-muted-foreground/40" />
        <div className="space-y-1">
          <p className="text-sm font-medium">No templates yet.</p>
          <p className="text-sm text-muted-foreground">
            Create one to share a message across your team.
          </p>
        </div>
        <Button onClick={onCreate} size="sm" className="gap-1.5">
          <Plus size={15} />
          New template
        </Button>
      </CardContent>
    </Card>
  );
}
