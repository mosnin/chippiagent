'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, MessageSquare, Mail, FileText, Loader2, Check, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  TEMPLATE_VARIABLES,
  type MessageChannel,
  type MessageTemplate,
} from '@/lib/message-templates';

const CHANNEL_META: Record<MessageChannel, { label: string; icon: typeof MessageSquare }> = {
  sms: { label: 'SMS', icon: MessageSquare },
  email: { label: 'Email', icon: Mail },
  note: { label: 'Note', icon: FileText },
};

interface Props {
  initial: MessageTemplate[];
}

/**
 * Two-pane editor: list of templates on the left, form on the right. Using a
 * light state model (no react-query etc.) to keep this one surface simple —
 * the list is rarely larger than a dozen rows.
 */
export function TemplatesEditor({ initial }: Props) {
  const [items, setItems] = useState<MessageTemplate[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [draft, setDraft] = useState<Partial<MessageTemplate>>(initial[0] ?? {});
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = items.find((t) => t.id === selectedId) ?? null;

  function select(t: MessageTemplate) {
    setCreating(false);
    setSelectedId(t.id);
    setDraft(t);
  }

  function startCreate() {
    setCreating(true);
    setSelectedId(null);
    setDraft({ name: '', channel: 'sms', body: '', subject: null });
  }

  async function save() {
    const name = (draft.name ?? '').trim();
    const content = (draft.body ?? '').trim();
    const channel = draft.channel ?? 'sms';
    if (!name || !content) {
      toast.error('Give it a name and a body first.');
      return;
    }
    setSaving(true);
    try {
      if (creating) {
        const res = await fetch('/api/message-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, channel, body: content, subject: draft.subject ?? null }),
        });
        if (!res.ok) { toast.error("Couldn't save that. Try again."); return; }
        const created: MessageTemplate = await res.json();
        setItems((prev) => [created, ...prev]);
        setSelectedId(created.id);
        setCreating(false);
        toast.success('Template saved.');
      } else if (selected) {
        const res = await fetch(`/api/message-templates/${selected.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, channel, body: content, subject: draft.subject ?? null }),
        });
        if (!res.ok) { toast.error("Couldn't save that. Try again."); return; }
        const updated: MessageTemplate = await res.json();
        setItems((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        toast.success('Template saved.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const prev = items;
    setItems((list) => list.filter((t) => t.id !== id));
    if (selectedId === id) {
      const next = items.find((t) => t.id !== id) ?? null;
      setSelectedId(next?.id ?? null);
      setDraft(next ?? {});
    }
    const res = await fetch(`/api/message-templates/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setItems(prev);
      toast.error("Couldn't delete that. Try again.");
    }
  }

  function insertVariable(key: string) {
    const token = `{{${key}}}`;
    setDraft((d) => ({ ...d, body: `${d.body ?? ''}${token}` }));
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4">
      {/* List */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {items.length} {items.length === 1 ? 'template' : 'templates'}
          </p>
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:text-foreground/70 transition-colors"
          >
            <Plus size={12} /> New
          </button>
        </div>

        {items.length === 0 ? (
          <div className="px-4 py-6 text-xs text-muted-foreground text-center">
            No templates yet. Add one and I&apos;ll keep it close.
          </div>
        ) : (
          <ul className="divide-y divide-border max-h-[60vh] overflow-y-auto">
            {items.map((t) => {
              const Icon = CHANNEL_META[t.channel].icon;
              const active = !creating && selectedId === t.id;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => select(t)}
                    className={cn(
                      'w-full px-3 py-2.5 flex items-center gap-2.5 text-left transition-colors',
                      active ? 'bg-muted' : 'hover:bg-muted/40',
                    )}
                  >
                    <Icon size={13} className="text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.name}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {CHANNEL_META[t.channel].label}
                      </p>
                    </div>
                    {active && <Check size={12} className="text-foreground flex-shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Editor */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        {!creating && !selected ? (
          <div className="text-center py-10">
            <Pencil size={22} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-semibold">Pick a template or create a new one</p>
            <p className="text-xs text-muted-foreground mt-1">They show up wherever you compose a message.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={draft.name ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Template name (e.g. Tour confirmation)"
                className="flex-1 text-sm font-semibold bg-transparent outline-none border-b border-border focus:border-foreground py-1"
                maxLength={120}
              />
              <select
                value={draft.channel ?? 'sms'}
                onChange={(e) => setDraft((d) => ({ ...d, channel: e.target.value as MessageChannel }))}
                className="text-xs border border-border rounded px-2 py-1 bg-transparent"
              >
                <option value="sms">SMS</option>
                <option value="email">Email</option>
                <option value="note">Note</option>
              </select>
            </div>

            {draft.channel === 'email' && (
              <input
                type="text"
                value={draft.subject ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                placeholder="Subject"
                className="w-full text-sm bg-transparent outline-none border border-border rounded px-2 py-1.5"
                maxLength={200}
              />
            )}

            <textarea
              value={draft.body ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              placeholder={"Hi {{contactFirstName}}, confirming our tour of {{propertyAddress}} on {{tourDate}} at {{tourTime}}. Reply to reschedule."}
              className="w-full min-h-[180px] text-sm bg-transparent outline-none border border-border rounded px-3 py-2 font-mono"
              maxLength={5000}
            />

            {/* Variable inserter */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Insert a variable
              </p>
              <div className="flex flex-wrap gap-1">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    className="text-[11px] font-mono rounded bg-muted hover:bg-muted/60 text-foreground px-1.5 py-0.5 transition-colors"
                    title={v.description}
                  >
                    {`{{${v.key}}}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              {selected && !creating ? (
                <button
                  type="button"
                  onClick={() => remove(selected.id)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 size={12} /> Delete
                </button>
              ) : <div />}
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground text-background text-sm font-semibold px-3 py-1.5 disabled:opacity-50"
              >
                {saving && <Loader2 size={12} className="animate-spin" />}
                {creating ? 'Create template' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
