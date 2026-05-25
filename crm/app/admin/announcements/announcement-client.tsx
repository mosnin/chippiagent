'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, Trash2, Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';

export type Announcement = {
  id: string;
  title: string | null;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  targetSegment: 'all' | 'trial' | 'active' | 'past_due' | 'admin';
  linkUrl: string | null;
  linkLabel: string | null;
  dismissible: boolean;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string | null;
};

type FormState = {
  title: string;
  message: string;
  severity: Announcement['severity'];
  targetSegment: Announcement['targetSegment'];
  linkUrl: string;
  linkLabel: string;
  dismissible: boolean;
  active: boolean;
  startsAt: string;
  endsAt: string;
};

const SEVERITY_STYLES: Record<Announcement['severity'], string> = {
  info: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/15',
  warning: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
  critical: 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/15',
};

const SEGMENT_LABELS: Record<Announcement['targetSegment'], string> = {
  all: 'All users',
  trial: 'Trial',
  active: 'Active',
  past_due: 'Past due',
  admin: 'Admins',
};

const EMPTY_FORM: FormState = {
  title: '',
  message: '',
  severity: 'info',
  targetSegment: 'all',
  linkUrl: '',
  linkLabel: '',
  dismissible: true,
  active: true,
  startsAt: '',
  endsAt: '',
};

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formFromAnnouncement(a: Announcement): FormState {
  return {
    title: a.title ?? '',
    message: a.message,
    severity: a.severity,
    targetSegment: a.targetSegment,
    linkUrl: a.linkUrl ?? '',
    linkLabel: a.linkLabel ?? '',
    dismissible: a.dismissible,
    active: a.active,
    startsAt: toDatetimeLocal(a.startsAt),
    endsAt: toDatetimeLocal(a.endsAt),
  };
}

export function AnnouncementClient({
  initialAnnouncements,
}: {
  initialAnnouncements: Announcement[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Announcement[]>(initialAnnouncements);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErr(null);
    setDialogOpen(true);
  }

  function openEdit(a: Announcement) {
    setEditing(a);
    setForm(formFromAnnouncement(a));
    setErr(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    setErr(null);
    if (!form.message.trim()) {
      setErr('Message is required.');
      return;
    }
    if (form.message.length > 500) {
      setErr('Message is too long (max 500 chars).');
      return;
    }
    if (form.title.length > 100) {
      setErr('Title is too long (max 100 chars).');
      return;
    }

    const payload = {
      title: form.title.trim() || null,
      message: form.message.trim(),
      severity: form.severity,
      targetSegment: form.targetSegment,
      linkUrl: form.linkUrl.trim() || null,
      linkLabel: form.linkLabel.trim() || null,
      dismissible: form.dismissible,
      active: form.active,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    };

    setSaving(true);
    try {
      const url = editing
        ? `/api/admin/announcements/${editing.id}`
        : `/api/admin/announcements`;
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || 'Save failed.');
        return;
      }
      const saved: Announcement = data.announcement;
      if (editing) {
        setRows((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      } else {
        setRows((prev) => [saved, ...prev]);
      }
      setDialogOpen(false);
      router.refresh();
    } catch {
      setErr('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/announcements/${confirmDelete.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error || 'Delete failed.');
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== confirmDelete.id));
      setConfirmDelete(null);
      router.refresh();
    } catch {
      setErr('Network error. Try again.');
    } finally {
      setDeleting(false);
    }
  }

  async function toggleActive(a: Announcement) {
    const next = !a.active;
    // Optimistic
    setRows((prev) => prev.map((r) => (r.id === a.id ? { ...r, active: next } : r)));
    const res = await fetch(`/api/admin/announcements/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: next }),
    });
    if (!res.ok) {
      // Revert
      setRows((prev) => prev.map((r) => (r.id === a.id ? { ...r, active: a.active } : r)));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? 'announcement' : 'announcements'}
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} className="mr-1" />
          New announcement
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={Megaphone}
            title="No announcements yet"
            description="Create one to show a banner to users."
          />
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Message</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Severity</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Segment</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Active</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Starts</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Ends</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Created</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {rows.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="max-w-[360px]">
                        {a.title && <div className="font-semibold truncate">{a.title}</div>}
                        <div className="text-muted-foreground truncate">{a.message}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex text-[10px] font-semibold rounded-full px-2 py-0.5 capitalize',
                          SEVERITY_STYLES[a.severity],
                        )}
                      >
                        {a.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs">
                      {SEGMENT_LABELS[a.targetSegment]}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(a)}
                        className={cn(
                          'inline-flex items-center text-[10px] font-semibold rounded-full px-2 py-0.5 border transition-colors',
                          a.active
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/15 dark:border-emerald-500/30'
                            : 'text-muted-foreground bg-muted border-border',
                        )}
                      >
                        {a.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground whitespace-nowrap">
                      {a.startsAt ? new Date(a.startsAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground whitespace-nowrap">
                      {a.endsAt ? new Date(a.endsAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(a.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(a)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Pencil size={12} />
                          Edit
                        </button>
                        <button
                          onClick={() => setConfirmDelete(a)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
                        >
                          <Trash2 size={12} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit announcement' : 'New announcement'}</DialogTitle>
            <DialogDescription>
              Configure who sees this banner and when.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Title (optional)</label>
              <Input
                value={form.title}
                maxLength={100}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Scheduled maintenance"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">
                Message <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={form.message}
                maxLength={500}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="We'll be offline briefly on Friday…"
                rows={3}
              />
              <p className="text-[10px] text-muted-foreground">{form.message.length} / 500</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Severity</label>
              <div className="flex gap-2">
                {(['info', 'warning', 'critical'] as const).map((sev) => (
                  <label
                    key={sev}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium cursor-pointer capitalize transition-colors',
                      form.severity === sev
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-muted/40',
                    )}
                  >
                    <input
                      type="radio"
                      name="severity"
                      value={sev}
                      checked={form.severity === sev}
                      onChange={() => setForm({ ...form, severity: sev })}
                      className="sr-only"
                    />
                    {sev}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Target segment</label>
              <Select
                value={form.targetSegment}
                onValueChange={(v) =>
                  setForm({ ...form, targetSegment: v as Announcement['targetSegment'] })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SEGMENT_LABELS) as Announcement['targetSegment'][]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {SEGMENT_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Link URL (optional)</label>
                <Input
                  value={form.linkUrl}
                  onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
                  placeholder="/settings/billing"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Link label</label>
                <Input
                  value={form.linkLabel}
                  maxLength={100}
                  onChange={(e) => setForm({ ...form, linkLabel: e.target.value })}
                  placeholder="Learn more"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Starts at (optional)</label>
                <Input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Ends at (optional)</label>
                <Input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={form.dismissible}
                  onChange={(e) => setForm({ ...form, dismissible: e.target.checked })}
                />
                Dismissible
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                Active
              </label>
            </div>

            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete announcement?</DialogTitle>
            <DialogDescription>
              This will permanently remove the announcement and all dismissal records. This cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
