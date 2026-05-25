'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Pencil, Check, X, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/lib/types';

function groupByDate(conversations: Conversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; items: Conversation[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'This week', items: [] },
    { label: 'Earlier', items: [] },
  ];

  for (const conv of conversations) {
    const d = new Date(conv.updatedAt);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (day >= today) groups[0].items.push(conv);
    else if (day >= yesterday) groups[1].items.push(conv);
    else if (day >= weekAgo) groups[2].items.push(conv);
    else groups[3].items.push(conv);
  }

  return groups.filter((g) => g.items.length > 0);
}

interface ConversationSidebarProps {
  slug: string;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (conv: Conversation) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

export function ConversationSidebar({
  slug,
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: ConversationSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  function startEdit(conv: Conversation) {
    setEditingId(conv.id);
    setEditTitle(conv.title);
  }

  function commitEdit(id: string) {
    if (editTitle.trim()) onRename(id, editTitle.trim());
    setEditingId(null);
  }

  const groups = groupByDate(conversations);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <Button onClick={onNew} variant="outline" className="w-full gap-2 justify-start" size="sm">
          <Plus size={14} />
          New conversation
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground/50">
            <MessageSquare size={24} />
            <p className="text-xs text-center">No conversations yet</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-2">
              <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                {group.label}
              </p>
              {group.items.map((conv) => (
                <div
                  key={conv.id}
                  className={cn(
                    'group flex items-center gap-1 mx-2 px-2 py-2 rounded-lg cursor-pointer transition-colors',
                    activeId === conv.id
                      ? 'bg-primary/10 text-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  onClick={() => onSelect(conv)}
                >
                  {editingId === conv.id ? (
                    <>
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit(conv.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 min-w-0 text-xs bg-transparent border-b border-border outline-none"
                      />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); commitEdit(conv.id); }}
                        className="flex-shrink-0 text-green-600 hover:text-green-700"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                        className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <X size={12} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 min-w-0 text-xs truncate">{conv.title}</span>
                      <div className="flex-shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); startEdit(conv); }}
                          className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted-foreground/20 transition-colors"
                        >
                          <Pencil size={10} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                          className="w-5 h-5 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
