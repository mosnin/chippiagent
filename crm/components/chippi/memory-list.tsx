'use client';

/**
 * MemoryList — shows the AgentMemory rows the agent has accumulated for the
 * space, grouped by what they're about (you / a person / a deal), with one
 * delete affordance per row.
 *
 * Editing isn't supported in v1: each row carries a vector embedding
 * generated at write time, and editing without re-embedding silently
 * degrades retrieval. The correction pattern is "delete the wrong fact and
 * let Chippi re-learn it" — same logic as in /api/agent/memory/[id]/route.ts.
 */

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Trash2, Loader2, Brain } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { STAGGER_CONTAINER, STAGGER_ITEM } from '@/lib/motion';

type MemoryType = 'fact' | 'preference' | 'observation' | 'reminder';
type EntityType = 'contact' | 'deal' | 'space' | null;

interface MemoryRow {
  id: string;
  memoryType: MemoryType;
  content: string;
  importance: number;
  entityType: EntityType;
  entityId: string | null;
  entityName: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const TYPE_LABEL: Record<MemoryType, string> = {
  fact: 'Fact',
  preference: 'Preference',
  observation: 'Observation',
  reminder: 'Reminder',
};

function groupBy(rows: MemoryRow[]): Record<'space' | 'contact' | 'deal' | 'other', MemoryRow[]> {
  return rows.reduce(
    (acc, r) => {
      const key = (r.entityType ?? 'other') as 'space' | 'contact' | 'deal' | 'other';
      acc[key].push(r);
      return acc;
    },
    { space: [], contact: [], deal: [], other: [] } as Record<
      'space' | 'contact' | 'deal' | 'other',
      MemoryRow[]
    >,
  );
}

export function MemoryList() {
  const [rows, setRows] = useState<MemoryRow[] | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/memory?limit=200');
      if (!res.ok) {
        toast.error("Couldn't load memory.");
        setRows([]);
        return;
      }
      const data = await res.json();
      setRows(Array.isArray(data) ? data : (data.rows ?? []));
    } catch {
      toast.error("Couldn't load memory.");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (deleting) return;
      setDeleting(id);
      try {
        const res = await fetch(`/api/agent/memory/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          toast.error("Couldn't forget that.");
          return;
        }
        setRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
        toast.success('Forgotten.');
      } catch {
        toast.error("Couldn't forget that.");
      } finally {
        setDeleting(null);
      }
    },
    [deleting],
  );

  if (rows === null) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center mb-4">
          <Brain size={20} className="text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">
          Chippi hasn&apos;t learned anything yet.
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1.5">
          Facts, preferences, and observations land here as you work together.
        </p>
      </div>
    );
  }

  const groups = groupBy(rows);
  const sections: { key: keyof typeof groups; label: string; sub: string }[] = [
    { key: 'space', label: 'About your business', sub: 'Things that apply across your workspace' },
    { key: 'contact', label: 'About people', sub: 'Per-contact facts and preferences' },
    { key: 'deal', label: 'About deals', sub: 'Per-deal context and history' },
    { key: 'other', label: 'Other', sub: 'Anything that doesn’t fit above' },
  ];

  return (
    <div className="space-y-12">
      {sections.map((section) => {
        const groupRows = groups[section.key];
        if (groupRows.length === 0) return null;
        return (
          <section key={section.key}>
            <div className="flex items-baseline justify-between pb-3 border-b border-border/60 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">{section.label}</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">{section.sub}</p>
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {groupRows.length}
              </span>
            </div>

            <motion.ul
              variants={STAGGER_CONTAINER}
              initial="initial"
              animate="enter"
              className="divide-y divide-border/60"
            >
              {groupRows.map((row) => (
                <motion.li
                  key={row.id}
                  variants={STAGGER_ITEM}
                  className="group/row flex items-start gap-3 py-3 first:pt-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug text-foreground">{row.content}</p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                      <span className="font-medium">{TYPE_LABEL[row.memoryType]}</span>
                      {row.entityName && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="truncate max-w-[200px]">{row.entityName}</span>
                        </>
                      )}
                      <span className="text-muted-foreground/40">·</span>
                      <span className="tabular-nums">{timeAgo(row.createdAt)}</span>
                      {row.importance >= 0.6 && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="text-amber-600 dark:text-amber-400">important</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDelete(row.id)}
                    disabled={deleting === row.id}
                    aria-label="Forget this"
                    title="Forget this"
                    className={cn(
                      'flex-shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md',
                      'text-muted-foreground/0 group-hover/row:text-muted-foreground/70',
                      'hover:text-foreground hover:bg-foreground/[0.05] transition-colors',
                      'disabled:opacity-50',
                    )}
                  >
                    {deleting === row.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Trash2 size={13} />
                    )}
                  </button>
                </motion.li>
              ))}
            </motion.ul>
          </section>
        );
      })}
    </div>
  );
}
