'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { ChippiWorkspace } from '@/components/chippi/chippi-workspace';
import type { Conversation } from '@/lib/types';
import type { MessageBlock } from '@/lib/ai-tools/blocks';
import { cn } from '@/lib/utils';

interface FloatingChatWidgetProps {
  slug: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  blocks?: MessageBlock[] | null;
}

export function FloatingChatWidget({ slug }: FloatingChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [initialConversationId, setInitialConversationId] = useState<string | null>(null);

  // When the workspace slug changes, clear cached chat session state so
  // we never reuse a conversationId from a different space.
  useEffect(() => {
    setIsOpen(false);
    setLoading(false);
    setBootstrapped(false);
    setSessionKey((k) => k + 1);
    setConversations([]);
    setInitialMessages([]);
    setInitialConversationId(null);
  }, [slug]);

  const hydrateChat = useCallback(async () => {
    setLoading(true);
    try {
      const convRes = await fetch(`/api/ai/conversations?slug=${encodeURIComponent(slug)}`);
      if (!convRes.ok) throw new Error('Failed to load conversations');
      const convs = (await convRes.json()) as Conversation[];
      setConversations(convs);

      if (convs.length > 0) {
        const latest = convs[0];
        setInitialConversationId(latest.id);
        const msgRes = await fetch(`/api/ai/messages?conversationId=${latest.id}`);
        if (msgRes.ok) {
          const msgs = (await msgRes.json()) as Array<{ role: string; content: string; blocks?: MessageBlock[] | null }>;
          setInitialMessages(
            msgs.map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
              blocks: m.blocks ?? null,
            }))
          );
        } else {
          setInitialMessages([]);
        }
      } else {
        setInitialConversationId(null);
        setInitialMessages([]);
      }

      setSessionKey((k) => k + 1);
      setBootstrapped(true);
    } catch (err) {
      console.error('[floating-chat] bootstrap failed', err);
      setConversations([]);
      setInitialMessages([]);
      setInitialConversationId(null);
      setSessionKey((k) => k + 1);
      setBootstrapped(true);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const toggleOpen = useCallback(async () => {
    if (!isOpen && !bootstrapped && !loading) {
      await hydrateChat();
    }
    setIsOpen((v) => !v);
  }, [isOpen, bootstrapped, loading, hydrateChat]);

  const chatKey = useMemo(
    () => `${slug}:${initialConversationId ?? 'new'}:${sessionKey}`,
    [slug, initialConversationId, sessionKey]
  );

  return (
    <div className="fixed bottom-24 right-6 z-50 flex flex-col items-end gap-3 md:bottom-6">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            className="w-[94vw] max-w-[430px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <p className="text-sm font-semibold">Chippi AI</p>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="h-[560px] bg-background">
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading chat…
                </div>
              ) : (
                <ChippiWorkspace
                  key={chatKey}
                  slug={slug}
                  initialMessages={initialMessages}
                  initialConversations={conversations}
                  initialConversationId={initialConversationId}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={toggleOpen}
        className={cn(
          'group relative inline-flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card shadow-xl transition',
          isOpen ? 'ring-2 ring-destructive/40' : 'hover:ring-2 hover:ring-primary/30'
        )}
      >
        <img src="/favicon.png" alt="Chippi" className="h-8 w-8 rounded-full" />
      </button>
    </div>
  );
}
