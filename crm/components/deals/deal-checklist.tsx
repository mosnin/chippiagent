'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Circle, Trash2, Plus, MessageCircle, Calendar, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DealChecklistItem, ChecklistKind, TemplateId } from '@/lib/deals/checklist';
import { TEMPLATES } from '@/lib/deals/checklist';

// Plain bullet for every kind. The label next to the bullet already names
// the step ("Earnest money", "Inspection"); a decorative emoji on top of
// that adds nothing the user can't already read, and breaks the brand
// voice (no emoji except the curly arrow). Keep the column for alignment.
const KIND_ICON: Record<ChecklistKind, string> = {
  earnest_money: '•',
  inspection: '•',
  appraisal: '•',
  loan_commitment: '•',
  clear_to_close: '•',
  final_walkthrough: '•',
  closing: '•',
  custom: '•',
};

interface DealChecklistProps {
  dealId: string;
  /** Initial items to render (from the SSR-fetched deal). Keeps first paint fast. */
  initial?: DealChecklistItem[];
}

export function DealChecklist({ dealId, initial = [] }: DealChecklistProps) {
  const [items, setItems] = useState<DealChecklistItem[]>(initial);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDueAt, setNewDueAt] = useState('');

  // Hydrate on mount only if nothing was passed in.
  useEffect(() => {
    if (initial.length > 0) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/deals/${dealId}/checklist`);
        if (!res.ok) return;
        const data: DealChecklistItem[] = await res.json();
        if (!cancelled) setItems(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [dealId, initial.length]);

  async function seedTemplate(templateId: TemplateId) {
    setSeeding(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: templateId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Couldn't add the checklist.");
        return;
      }
      const data: DealChecklistItem[] = await res.json();
      setItems(data);
      toast.success('Checklist added. Tweak any dates that don’t match your contract.');
    } catch {
      toast.error("Couldn't add the checklist.");
    } finally {
      setSeeding(false);
    }
  }

  async function toggleComplete(item: DealChecklistItem) {
    const wasComplete = !!item.completedAt;
    // Optimistic
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, completedAt: wasComplete ? null : new Date().toISOString() } : i));

    const res = await fetch(`/api/deals/${dealId}/checklist/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !wasComplete }),
    });
    if (!res.ok) {
      setItems((prev) => prev.map((i) => i.id === item.id ? item : i));
      toast.error("Couldn't update that item.");
    }
  }

  async function updateDueDate(item: DealChecklistItem, dueAt: string | null) {
    const prev = item.dueAt;
    setItems((list) => list.map((i) => i.id === item.id ? { ...i, dueAt } : i));

    const res = await fetch(`/api/deals/${dealId}/checklist/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dueAt: dueAt ? new Date(dueAt).toISOString() : null }),
    });
    if (!res.ok) {
      setItems((list) => list.map((i) => i.id === item.id ? { ...i, dueAt: prev } : i));
      toast.error("Couldn't save that due date.");
    }
  }

  async function addCustom() {
    const label = newLabel.trim();
    if (!label) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'custom', label, dueAt: newDueAt || undefined }),
      });
      if (!res.ok) {
        toast.error("Couldn't add that item.");
        return;
      }
      const created: DealChecklistItem = await res.json();
      setItems((prev) => [...prev, created]);
      setNewLabel('');
      setNewDueAt('');
    } finally {
      setAdding(false);
    }
  }

  async function remove(item: DealChecklistItem) {
    const prev = items;
    setItems((list) => list.filter((i) => i.id !== item.id));
    const res = await fetch(`/api/deals/${dealId}/checklist/${item.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setItems(prev);
      toast.error("Couldn't delete that item.");
    }
  }

  const complete = items.filter((i) => i.completedAt).length;
  const total = items.length;

  if (loading && items.length === 0) {
    return <div className="text-sm text-muted-foreground py-4">One moment.</div>;
  }

  // Empty state — offer template choices for the canonical flows.
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/10 px-5 py-6 text-center space-y-4">
        <div>
          <p className="text-sm font-semibold mb-1">Start from a template</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Pick the flow that fits this deal — dates anchor to the expected close and can be edited afterwards.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
          {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => {
            const t = TEMPLATES[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => seedTemplate(id)}
                disabled={seeding}
                className="flex-1 rounded-md border border-border bg-card hover:border-foreground hover:bg-muted/40 text-left px-3 py-2.5 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  {seeding ? <Loader2 size={12} className="animate-spin" /> : <MessageCircle size={12} />}
                  <span className="text-sm font-semibold">{t.label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{t.description}</p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Progress header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{complete}/{total} complete</span>
          <div className="w-32 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-foreground transition-all"
              style={{ width: `${total === 0 ? 0 : (complete / total) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Items */}
      <ul className="space-y-1.5">
        {items.map((item) => {
          const done = !!item.completedAt;
          const due = item.dueAt ? new Date(item.dueAt) : null;
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const overdue = !done && due && !isNaN(due.getTime()) && due.getTime() < today.getTime();
          return (
            <li
              key={item.id}
              className={cn(
                'group flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5',
                done && 'opacity-60',
              )}
            >
              <button
                type="button"
                onClick={() => toggleComplete(item)}
                className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={done ? `Mark ${item.label} as not done` : `Mark ${item.label} as done`}
              >
                {done
                  ? <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
                  : <Circle size={18} />}
              </button>

              <span className="text-base flex-shrink-0 w-5 text-center" aria-hidden>
                {KIND_ICON[item.kind] ?? '•'}
              </span>

              <span className={cn('text-sm flex-1 min-w-0', done && 'line-through')}>
                {item.label}
              </span>

              {overdue && !done && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 dark:text-red-400">
                  <AlertTriangle size={11} />
                  Overdue
                </span>
              )}

              <input
                type="date"
                value={item.dueAt ? new Date(item.dueAt).toISOString().slice(0, 10) : ''}
                onChange={(e) => updateDueDate(item, e.target.value || null)}
                className="text-xs border border-border rounded px-1.5 py-0.5 bg-transparent"
                aria-label={`Due date for ${item.label}`}
              />

              <button
                type="button"
                onClick={() => remove(item)}
                className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-muted-foreground hover:text-destructive transition-all"
                aria-label={`Delete ${item.label}`}
              >
                <Trash2 size={13} />
              </button>
            </li>
          );
        })}
      </ul>

      {/* Custom add row */}
      <div className="flex items-center gap-2 pt-1">
        <Plus size={14} className="text-muted-foreground flex-shrink-0" />
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Add a custom item (e.g., HOA document delivered)"
          className="flex-1 text-sm bg-transparent border-b border-border focus:border-foreground outline-none py-1"
          onKeyDown={(e) => { if (e.key === 'Enter') addCustom(); }}
          disabled={adding}
        />
        <input
          type="date"
          value={newDueAt}
          onChange={(e) => setNewDueAt(e.target.value)}
          className="text-xs border border-border rounded px-1.5 py-0.5 bg-transparent"
          aria-label="Due date for new item"
          disabled={adding}
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={adding || !newLabel.trim()}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}
