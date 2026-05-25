'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MoreHorizontal, Plus, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BODY_COMPACT, CAPTION, META } from '@/lib/typography';
import { STAGGER_CONTAINER, STAGGER_ITEM } from '@/lib/motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Conversation } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// SidebarConversations — slim conversation list rendered inside the realtor
// sidebar's contextual section when on `/chippi`. Owns its own data fetch and
// list mutations so it can be dropped into any sidebar slot.
//
// The list deliberately collapses to nothing in collapsed (icon-rail) mode —
// the rail is too narrow to read titles, and we already have the chat icon in
// the primary nav.
// ─────────────────────────────────────────────────────────────────────────────

interface SidebarConversationsProps {
  slug: string;
  /** Hide entirely when the rail is collapsed. */
  collapsed?: boolean;
  /** Fired when a conversation row or "New" is activated — useful for closing
   *  a parent mobile sheet on navigation. */
  onSelect?: () => void;
}

function timeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
  if (diff < 86400 * 30) return `${Math.floor(diff / (86400 * 7))}w`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function truncateTitle(title: string, max = 24): string {
  if (title.length <= max) return title;
  return title.slice(0, max - 1).trimEnd() + '…';
}

export function SidebarConversations({
  slug,
  collapsed = false,
  onSelect,
}: SidebarConversationsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeId = searchParams.get('conversationId');

  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai/conversations?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) {
        setConversations([]);
        return;
      }
      const data = (await res.json()) as Conversation[];
      setConversations(data);
    } catch {
      setConversations([]);
    }
  }, [slug]);

  // Refetch on mount and whenever the user navigates back into /chippi so the
  // list reflects any conversations created from inside the workspace.
  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations, pathname]);

  const handleNew = useCallback(async () => {
    const res = await fetch('/api/ai/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    });
    if (!res.ok) return;
    const conv = (await res.json()) as Conversation;
    setConversations((prev) => (prev ? [conv, ...prev] : [conv]));
    router.push(`/s/${slug}/chippi?conversationId=${conv.id}`);
    onSelect?.();
  }, [router, slug, onSelect]);

  const handleDelete = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/ai/conversations/${id}`, { method: 'DELETE' });
      if (!res.ok) return;
      setConversations((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
      if (activeId === id) router.push(`/s/${slug}/chippi`);
    },
    [activeId, router, slug],
  );

  const startRename = useCallback((conv: Conversation) => {
    setRenamingId(conv.id);
    setRenameValue(conv.title);
  }, []);

  const commitRename = useCallback(
    async (id: string) => {
      const title = renameValue.trim();
      setRenamingId(null);
      if (!title) return;
      const res = await fetch(`/api/ai/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) return;
      const updated = (await res.json()) as Conversation;
      setConversations((prev) =>
        prev ? prev.map((c) => (c.id === id ? updated : c)) : prev,
      );
    },
    [renameValue],
  );

  if (collapsed) return null;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => void handleNew()}
        className="group w-full flex items-center gap-2 h-8 px-2.5 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150"
      >
        <Plus size={13} strokeWidth={1.75} className="flex-shrink-0" />
        <span className="flex-1 text-left">New conversation</span>
      </button>

      <div className="pt-1">
        {conversations === null ? (
          <div className="space-y-1 px-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-10 rounded-md bg-foreground/[0.04] animate-pulse"
                aria-hidden
              />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 text-center px-4 py-6 leading-snug">
            Start a conversation to build your history here.
          </p>
        ) : (
          <motion.ul
            variants={STAGGER_CONTAINER}
            initial="initial"
            animate="enter"
            className="space-y-px"
          >
            {conversations.map((conv) => {
              const isActive = activeId === conv.id;
              const isRenaming = renamingId === conv.id;
              return (
                <motion.li
                  key={conv.id}
                  variants={STAGGER_ITEM}
                  className="relative"
                >
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-foreground"
                    />
                  )}
                  {isRenaming ? (
                    <div className="flex items-center gap-1 pl-2.5 pr-1.5 py-1.5">
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => void commitRename(conv.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void commitRename(conv.id);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        className={cn(
                          BODY_COMPACT,
                          'flex-1 min-w-0 bg-transparent border-b border-border outline-none',
                        )}
                      />
                    </div>
                  ) : (
                    <div
                      className={cn(
                        'group/row flex items-center gap-1 rounded-md transition-colors duration-150',
                        isActive
                          ? 'bg-foreground/[0.045]'
                          : 'hover:bg-foreground/[0.04]',
                      )}
                    >
                      <Link
                        href={`/s/${slug}/chippi?conversationId=${conv.id}`}
                        onClick={() => onSelect?.()}
                        className="flex-1 min-w-0 pl-2.5 pr-1 py-1.5"
                      >
                        <p
                          className={cn(
                            BODY_COMPACT,
                            'truncate leading-tight',
                            isActive ? 'font-medium' : 'text-foreground/80',
                          )}
                          title={conv.title}
                        >
                          {truncateTitle(conv.title)}
                        </p>
                        {conv.preview ? (
                          <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5 leading-tight">
                            {conv.preview}
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground/40 truncate mt-0.5 leading-tight">
                            No messages yet
                          </p>
                        )}
                        <p className={cn(META, 'leading-tight mt-0.5')}>
                          {timeAgo(conv.updatedAt)}
                        </p>
                      </Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              'flex-shrink-0 w-6 h-6 mr-1 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.06] transition-colors',
                              'opacity-0 group-hover/row:opacity-100 focus:opacity-100 data-[state=open]:opacity-100',
                            )}
                            aria-label="Conversation actions"
                          >
                            <MoreHorizontal size={13} strokeWidth={1.75} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem onSelect={() => startRename(conv)}>
                            <Pencil size={12} />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => void handleDelete(conv.id)}
                          >
                            <Trash2 size={12} />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </div>
    </div>
  );
}
