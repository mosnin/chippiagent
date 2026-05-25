'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Trash2, Loader2, AlertCircle, User, Briefcase, Globe, Wrench, MessageCircle, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { toast } from 'sonner';

interface MemoryRow {
  id: string;
  memoryType: 'fact' | 'preference' | 'observation' | 'reminder';
  content: string;
  importance: number;
  entityType: 'contact' | 'deal' | 'space' | null;
  entityId: string | null;
  entityName: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  sourceRunId: string | null;
  sourceToolName: string | null;
  sourceConversationId: string | null;
}

const TYPE_LABEL: Record<MemoryRow['memoryType'], string> = {
  fact: 'Fact',
  preference: 'Preference',
  observation: 'Observation',
  reminder: 'Reminder',
};

const FILTERS = [
  { entity: null, label: 'All' },
  { entity: 'contact', label: 'People' },
  { entity: 'deal', label: 'Deals' },
  { entity: 'space', label: 'Workspace' },
] as const;

function entityIcon(entityType: MemoryRow['entityType']) {
  if (entityType === 'contact') return User;
  if (entityType === 'deal') return Briefcase;
  return Globe;
}

export function MemoryFeed({ slug }: { slug: string }) {
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'contact' | 'deal' | 'space' | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  // Debounce search input so we don't refetch on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (filter) params.set('entityType', filter);
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      const res = await fetch(`/api/agent/memory?${params}`);
      if (res.ok) {
        const data = (await res.json()) as MemoryRow[];
        setMemories(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  }, [filter, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(memory: MemoryRow) {
    if (!confirm("Delete this memory? Chippi will re-learn it if it comes up again.")) return;
    setDeleting(memory.id);
    try {
      const res = await fetch(`/api/agent/memory/${memory.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Couldn't delete that memory.");
        return;
      }
      setMemories((prev) => prev.filter((m) => m.id !== memory.id));
      toast.success('Forgotten.');
    } finally {
      setDeleting(null);
    }
  }

  // Group by entity for readability — keeps "everything Chippi knows about
  // Sarah" together. Within each group, importance + recency order from the
  // server is preserved.
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; entityType: MemoryRow['entityType']; entityId: string | null; rows: MemoryRow[] }>();
    for (const m of memories) {
      const key =
        m.entityType && m.entityId
          ? `${m.entityType}:${m.entityId}`
          : m.entityType
            ? `${m.entityType}:_`
            : 'general';
      if (!map.has(key)) {
        map.set(key, {
          key,
          label:
            m.entityType === 'contact'
              ? (m.entityName ?? 'Unknown contact')
              : m.entityType === 'deal'
                ? (m.entityName ?? 'Unknown deal')
                : m.entityType === 'space'
                  ? 'Your workspace'
                  : 'General',
          entityType: m.entityType,
          entityId: m.entityId,
          rows: [],
        });
      }
      map.get(key)!.rows.push(m);
    }
    return Array.from(map.values());
  }, [memories]);

  const total = memories.length;

  return (
    <div className="space-y-6">
      {/* Filter + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-1 -mx-2 px-2 overflow-x-auto">
          {FILTERS.map((f) => {
            const isActive = filter === f.entity;
            return (
              <button
                key={f.label}
                type="button"
                onClick={() => setFilter(f.entity)}
                className={cn(
                  'px-3 py-1.5 text-sm whitespace-nowrap rounded-full transition-colors',
                  isActive
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="relative sm:ml-auto sm:max-w-xs flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search what I remember…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="space-y-2">
              <div className="h-4 w-32 rounded bg-muted/40 animate-pulse" />
              <div className="h-12 w-full rounded bg-muted/30 animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {!loading && total === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {debouncedSearch || filter
            ? "Nothing matches that filter."
            : "I haven't learned anything yet — give me time."}
        </div>
      )}

      {!loading && groups.length > 0 && (
        <div className="space-y-10">
          {groups.map((group) => {
            const Icon = entityIcon(group.entityType);
            const headerHref =
              group.entityType === 'contact' && group.entityId
                ? `/s/${slug}/contacts/${group.entityId}`
                : null;
            const HeadingInner = (
              <div className="flex items-center gap-2 text-sm">
                <Icon size={13} className="text-muted-foreground" />
                <span className="font-medium text-foreground">{group.label}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {group.rows.length}
                </span>
              </div>
            );

            return (
              <section key={group.key} className="space-y-3">
                <div className="pb-2 border-b border-border/60">
                  {headerHref ? (
                    <Link href={headerHref} className="hover:underline underline-offset-4">
                      {HeadingInner}
                    </Link>
                  ) : (
                    HeadingInner
                  )}
                </div>
                <ul className="divide-y divide-border/60">
                  {group.rows.map((memory) => (
                    <li key={memory.id} className="group/row py-3 first:pt-1">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground leading-relaxed">
                            {memory.content}
                          </p>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span className="lowercase tracking-wide">
                              {TYPE_LABEL[memory.memoryType].toLowerCase()}
                            </span>
                            <span className="text-muted-foreground/50">·</span>
                            <span className="tabular-nums">{timeAgo(memory.createdAt)}</span>
                            {memory.importance >= 0.7 && (
                              <span className="text-amber-600 dark:text-amber-400">important</span>
                            )}
                            {memory.expiresAt && (
                              <span className="inline-flex items-center gap-1">
                                <AlertCircle size={10} />
                                expires {timeAgo(memory.expiresAt)}
                              </span>
                            )}
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            {memory.sourceToolName && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/70">
                                <Wrench size={10} />
                                {memory.sourceToolName}
                              </span>
                            )}
                            {!memory.sourceToolName && memory.sourceConversationId && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/70">
                                <MessageCircle size={10} />
                                chat
                              </span>
                            )}
                            {!memory.sourceToolName && !memory.sourceConversationId && memory.sourceRunId && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/70">
                                <Play size={10} />
                                auto-run
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDelete(memory)}
                          disabled={deleting === memory.id}
                          aria-label="Forget this memory"
                          title="Forget this memory"
                          className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                        >
                          {deleting === memory.id ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <Trash2 size={11} />
                          )}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
