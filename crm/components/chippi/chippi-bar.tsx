'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Send, Square, Loader2, X, ArrowUpRight, MessageCircle, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Transcript } from '@/components/ai/blocks/transcript';
import { useAgentTask } from '@/components/ai/hooks/use-agent-task';
import { useDictation } from './use-dictation';

interface Props {
  slug: string;
}

const STORAGE_KEY = (slug: string) => `chippi.bar.${slug}.convId`;
const MAX_PANEL_MESSAGES = 6;

/**
 * ChippiBar — the persistent agent presence on every workspace page.
 *
 * Slim by default: a single input pinned to the bottom of the viewport,
 * one keystroke (⌘/) or one tap from anywhere. Click into it (or send a
 * message) and a floating thread slides up above the bar showing the live
 * exchange. Esc collapses back to slim. The conversation persists across
 * pages via sessionStorage; navigating to /chippi opens the same thread
 * in the long-form surface.
 *
 * Hidden on /chippi (that page already IS the chat).
 */
export function ChippiBar({ slug }: Props) {
  const pathname = usePathname() ?? '';
  const onChippiPage = pathname.endsWith(`/s/${slug}/chippi`) || pathname.startsWith(`/s/${slug}/chippi/`);

  const contextPlaceholder = useMemo(() => {
    if (pathname.includes('/contacts') || pathname.includes('/people')) {
      return 'Ask about a contact or draft a follow-up…';
    }
    if (pathname.includes('/deals')) {
      return 'Ask about a deal or find what\'s stuck…';
    }
    if (pathname.includes('/calendar')) {
      return 'Schedule a tour or check availability…';
    }
    if (pathname.includes('/leads')) {
      return 'Ask about a lead or set a follow-up…';
    }
    if (pathname.includes('/analytics')) {
      return 'Ask about your pipeline or run a summary…';
    }
    if (pathname.includes('/commissions')) {
      return 'Ask about your earnings or a specific deal…';
    }
    if (pathname.includes('/integrations')) {
      return 'Ask about your connected tools…';
    }
    if (pathname.includes('/settings') || pathname.includes('/configure')) {
      return 'Ask Chippi anything about your setup…';
    }
    return 'Ask Chippi or just talk…';
  }, [pathname]);

  const [convId, setConvId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Hold-to-dictate. Snapshot the draft when listening starts so the live
  // transcript appends to (rather than overwrites) anything the user had
  // typed manually before reaching for the mic.
  const draftAtDictationStart = useRef('');
  const dictation = useDictation({
    onFinal: (text) => {
      setDraft((prev) => {
        const prefix = draftAtDictationStart.current.trim();
        return prefix ? `${prefix} ${text}` : text;
      });
    },
  });
  // Live preview while listening — mirror the live transcript into the
  // input so the realtor sees their words land as they speak.
  useEffect(() => {
    if (!dictation.listening) return;
    const prefix = draftAtDictationStart.current.trim();
    setDraft(prefix ? `${prefix} ${dictation.transcript}` : dictation.transcript);
  }, [dictation.transcript, dictation.listening]);

  const startDictation = useCallback(() => {
    if (!dictation.supported || dictation.listening) return;
    draftAtDictationStart.current = draft;
    setExpanded(true);
    dictation.start();
  }, [dictation, draft]);

  const stopDictation = useCallback(() => {
    if (dictation.listening) dictation.stop();
  }, [dictation]);

  // Restore the most recent bar conversation for this workspace from session.
  // sessionStorage scopes to the tab — closing the tab gives a fresh start.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.sessionStorage.getItem(STORAGE_KEY(slug));
    if (stored) setConvId(stored);
  }, [slug]);

  const {
    messages,
    isStreaming,
    pendingApproval,
    liveCallIds,
    error,
    send,
    approve,
    deny,
    alwaysAllow,
    abort,
    clearError,
  } = useAgentTask({
    spaceSlug: slug,
    conversationId: convId,
    onConversationCreated: (id) => {
      setConvId(id);
      try { window.sessionStorage.setItem(STORAGE_KEY(slug), id); } catch { /* ignore */ }
    },
  });

  const hasContent = messages.length > 0 || isStreaming || error;

  // Auto-expand whenever there's something to show — messages arriving,
  // a stream in flight, or an error to surface.
  useEffect(() => {
    if (hasContent) setExpanded(true);
  }, [hasContent]);

  // Auto-scroll the panel as new content lands
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, pendingApproval, isStreaming]);

  // Global keyboard: ⌘/ (or Ctrl+/) focuses the bar from anywhere.
  // Esc collapses the panel (unless mid-stream — don't yank context away).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
        if (!hasContent) setExpanded(true);
      }
      if (e.key === 'Escape' && expanded && !isStreaming) {
        setExpanded(false);
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, hasContent, isStreaming]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = draft.trim();
      if (!text || isStreaming || pendingApproval) return;
      setDraft('');
      setExpanded(true);
      await send(text);
    },
    [draft, isStreaming, pendingApproval, send],
  );

  // The trailing assistant message — used to detect the "thinking" state.
  const tailMessage = useMemo(() => messages[messages.length - 1] ?? null, [messages]);
  const showThinking =
    isStreaming && tailMessage?.role === 'assistant' && tailMessage.blocks.length === 0;

  // Only render the bar inside a workspace, and not on /chippi itself.
  if (onChippiPage) return null;

  // The most recent few messages — keep the panel light. Full thread lives
  // in /chippi.
  const visibleMessages = messages.slice(-MAX_PANEL_MESSAGES);
  const hiddenCount = Math.max(0, messages.length - visibleMessages.length);
  const chippiHref = `/s/${slug}/chippi`;

  return (
    <div
      className={cn(
        'fixed z-30 pointer-events-none',
        // Right column on desktop (after the 240px sidebar); above mobile nav on mobile.
        'left-0 right-0 bottom-16 md:left-[240px] md:bottom-0',
        'px-3 sm:px-6 pb-3 md:pb-5',
      )}
      role="region"
      aria-label="Chippi"
    >
      {/* Floating panel above the bar, shown when expanded */}
      {expanded && hasContent && (
        <div
          ref={panelRef}
          className="pointer-events-auto mx-auto max-w-3xl mb-2 rounded-2xl border border-border bg-background/95 backdrop-blur-md shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-border/60">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Chippi
            </div>
            <div className="flex items-center gap-1">
              <Link
                href={chippiHref}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/60"
                title="Open in full chat"
              >
                Open in chat
                <ArrowUpRight size={11} />
              </Link>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                aria-label="Collapse"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          <ScrollArea className="max-h-[50vh]">
            <div className="px-4 py-4 space-y-5">
              {hiddenCount > 0 && (
                <Link
                  href={chippiHref}
                  className="block text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  + {hiddenCount} earlier message{hiddenCount === 1 ? '' : 's'} — see all
                </Link>
              )}

              {visibleMessages.map((msg, i) => {
                const isTail = i === visibleMessages.length - 1;
                if (isTail && msg.role === 'assistant' && msg.blocks.length === 0 && isStreaming) {
                  return null;
                }
                if (msg.role === 'assistant') {
                  return (
                    <div key={msg.id} className="flex gap-2.5">
                      <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 mt-0.5 ring-1 ring-border/60">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/chip-avatar.png" alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <Transcript
                          blocks={msg.blocks}
                          role={msg.role}
                          streaming={msg.streaming && isStreaming}
                          liveCallIds={liveCallIds}
                          pendingApproval={
                            isTail && pendingApproval && !isStreaming
                              ? {
                                  prompt: pendingApproval,
                                  onApprove: approve,
                                  onDeny: deny,
                                  onAlwaysAllow: alwaysAllow,
                                  busy: isStreaming,
                                }
                              : undefined
                          }
                        />
                      </div>
                    </div>
                  );
                }
                return (
                  <Transcript
                    key={msg.id}
                    blocks={msg.blocks}
                    role={msg.role}
                    streaming={msg.streaming && isStreaming}
                    liveCallIds={liveCallIds}
                  />
                );
              })}

              {showThinking && (
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 ring-1 ring-border/60">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/chip-avatar.png" alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span className="inline-block w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse" />
                    <span className="inline-block w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:0.2s]" />
                    <span className="inline-block w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:0.4s]" />
                    <span className="ml-1 italic">thinking…</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
                  <span className="flex-1">{error}</span>
                  <button
                    type="button"
                    onClick={clearError}
                    aria-label="Dismiss error"
                    className="text-rose-600/70 dark:text-rose-300/70 hover:text-rose-800 dark:hover:text-rose-100"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Slim bar */}
      <form
        onSubmit={handleSubmit}
        className={cn(
          'pointer-events-auto mx-auto max-w-3xl flex items-center gap-2',
          'rounded-full border border-border bg-background/95 backdrop-blur-md',
          'pl-4 pr-1.5 py-1.5 shadow-lg',
        )}
      >
        <MessageCircle size={13} className="text-muted-foreground/80 flex-shrink-0" />
        <input
          ref={inputRef}
          id="chippi-bar-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setExpanded(true)}
          placeholder={dictation.listening ? 'Listening…' : contextPlaceholder}
          disabled={!!pendingApproval}
          aria-label="Message Chippi"
          className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm placeholder:text-muted-foreground/70 disabled:opacity-50"
        />
        {dictation.supported && !isStreaming && (
          <button
            type="button"
            // Hold-to-talk: pointer events cover both mouse and touch in
            // one gesture. PointerLeave + PointerCancel guard against the
            // recognizer staying live if the user drags off the button.
            onPointerDown={(e) => { e.preventDefault(); startDictation(); }}
            onPointerUp={(e) => { e.preventDefault(); stopDictation(); }}
            onPointerLeave={() => { if (dictation.listening) stopDictation(); }}
            onPointerCancel={() => { if (dictation.listening) stopDictation(); }}
            disabled={!!pendingApproval}
            aria-label={dictation.listening ? 'Listening — release to send' : 'Hold to talk'}
            title="Hold to talk"
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-full transition-all',
              dictation.listening
                ? 'bg-rose-500 text-white scale-110 shadow-lg shadow-rose-500/40'
                : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/60',
            )}
          >
            <Mic size={13} className={dictation.listening ? 'animate-pulse' : ''} />
          </button>
        )}
        {isStreaming ? (
          <button
            type="button"
            onClick={abort}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-foreground text-background hover:opacity-90 transition-opacity"
            aria-label="Stop generating"
            title="Stop"
          >
            <Square size={11} className="fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!draft.trim() || !!pendingApproval}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Send"
          >
            {pendingApproval ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
          </button>
        )}
      </form>
    </div>
  );
}
