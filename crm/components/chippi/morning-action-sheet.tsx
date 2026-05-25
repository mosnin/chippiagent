'use client';

/**
 * The inline draft preview that slides down under the morning sentence
 * when the realtor taps a compose action. Replaces the chat-prefill
 * teleporter — Phase 7. The realtor never leaves the home.
 *
 * One state machine: 'loading' → 'preview' → 'sending' → done. Errors land
 * on a retry surface with Edit (chat) as the escape hatch. Cancel collapses
 * back. No confirm dialog on Send — one tap is one tap; the toast IS the
 * confirmation.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import type { MorningActionContext, MorningActionIntent } from './morning-actions';
import { ApprovalCelebration, type ApprovalKind } from './approval-celebration';

interface DraftPreview {
  channel: 'email' | 'sms' | 'note';
  subject: string | null;
  body: string;
  contactName?: string;
}

type Phase = 'loading' | 'preview' | 'error' | 'sending' | 'celebrating';

interface Props {
  slug: string;
  intent: MorningActionIntent;
  context: MorningActionContext;
  /** Called after a successful send so the parent can collapse the panel. */
  onSent: () => void;
  /** Called when the realtor taps Cancel. */
  onCancel: () => void;
}

export function MorningActionSheet({ slug, intent, context, onSent, onCancel }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  const [draft, setDraft] = useState<DraftPreview | null>(null);
  const [celebrationKind, setCelebrationKind] = useState<ApprovalKind | null>(null);

  // Fetch the draft on mount. Each mount = one fresh compose; closing and
  // reopening the panel re-drafts (the realtor can re-roll by re-tapping).
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/agent/quick-draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'preview',
            context: context.kind,
            id: context.id,
            intent,
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          setPhase('error');
          return;
        }
        const data = (await res.json()) as DraftPreview & { contactName?: string };
        setDraft(data);
        setPhase('preview');
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setPhase('error');
      }
    })();
    return () => controller.abort();
  }, [context.id, context.kind, intent]);

  async function handleSend() {
    if (!draft) return;
    setPhase('sending');
    try {
      const res = await fetch('/api/agent/quick-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'send',
          context: context.kind,
          id: context.id,
          intent,
          channel: draft.channel,
          subject: draft.subject ?? undefined,
          body: draft.body,
        }),
      });
      if (!res.ok) {
        toast.error("Couldn't send that. Try again.");
        setPhase('preview');
        return;
      }
      const data = (await res.json()) as {
        contactName?: string;
        deliveryResult?: { sent: boolean; error?: string };
      };
      const name = data.contactName ?? context.label;
      // The "not_configured" path is a half-win — the realtor's intent was
      // sound but delivery isn't wired; the toast nudges them at integrations
      // instead of pretending the message went out. The other paths swap the
      // sheet for the inline celebration; the parent collapses only after
      // the dwell so the moment lands on the same surface that fired it.
      if (data.deliveryResult?.error === 'not_configured') {
        toast.success(`Saved for ${name}. Add an integration and I can auto-send next time.`);
        onSent();
        return;
      }
      const kind: ApprovalKind =
        draft.channel === 'note' ? 'note' : draft.channel === 'email' ? 'email' : 'sms';
      setCelebrationKind(kind);
      setPhase('celebrating');
    } catch {
      toast.error('I lost the connection. Try again.');
      setPhase('preview');
    }
  }

  function handleEdit() {
    if (!draft) return;
    // The escape hatch — drop the realtor into the chat with the draft as
    // prefill so they can rewrite from scratch. This is the ONE place chat
    // still gets involved; everywhere else fires inline.
    const prefill = draft.subject
      ? `Subject: ${draft.subject}\n\n${draft.body}`
      : draft.body;
    router.push(`/s/${slug}/chippi?prefill=${encodeURIComponent(prefill)}`);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0, transition: { duration: DURATION_BASE, ease: EASE_OUT } }}
      exit={{ opacity: 0, y: -4, transition: { duration: DURATION_BASE, ease: EASE_OUT } }}
      className={cn(
        'mx-auto mt-4 max-w-xl rounded-lg border border-border/70 bg-card p-4 text-left',
      )}
    >
      {phase === 'loading' && (
        <p className="text-sm text-muted-foreground">Drafting…</p>
      )}

      {phase === 'error' && (
        <div className="space-y-3">
          <p className="text-sm text-foreground">
            Couldn&apos;t draft that. Try again or open the chat.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                // Re-mount cycle: parent owns mount; the simplest retry is
                // to flip back to loading and refetch in-place.
                setPhase('loading');
                setDraft(null);
                void (async () => {
                  try {
                    const res = await fetch('/api/agent/quick-draft', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        mode: 'preview',
                        context: context.kind,
                        id: context.id,
                        intent,
                      }),
                    });
                    if (!res.ok) {
                      setPhase('error');
                      return;
                    }
                    const data = (await res.json()) as DraftPreview;
                    setDraft(data);
                    setPhase('preview');
                  } catch {
                    setPhase('error');
                  }
                })();
              }}
              className="inline-flex h-9 items-center rounded-full border border-border/70 bg-background px-4 text-sm hover:bg-muted/40"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => router.push(`/s/${slug}/chippi`)}
              className="inline-flex h-9 items-center rounded-full border border-border/70 bg-background px-4 text-sm hover:bg-muted/40"
            >
              Open chat
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-9 items-center px-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {(phase === 'preview' || phase === 'sending') && draft && (
        <div className="space-y-3">
          {draft.subject && (
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {draft.subject}
            </p>
          )}
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {draft.body}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleSend}
              disabled={phase === 'sending'}
              className={cn(
                'inline-flex h-9 items-center rounded-full px-4 text-sm transition-colors',
                'bg-foreground text-background hover:bg-foreground/90',
                'disabled:opacity-60 disabled:cursor-not-allowed',
              )}
            >
              {phase === 'sending'
                ? 'Sending…'
                : draft.channel === 'note'
                  ? 'Log it'
                  : 'Send'}
            </button>
            <button
              type="button"
              onClick={handleEdit}
              disabled={phase === 'sending'}
              className="inline-flex h-9 items-center rounded-full border border-border/70 bg-background px-4 text-sm text-foreground hover:bg-muted/40"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={phase === 'sending'}
              className="inline-flex h-9 items-center px-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* The win moment — the same surface that fired the send transforms in
          place into one calm sentence in Chippi's voice. The component owns
          the dwell + dissolve and tells us when to collapse the parent. */}
      <AnimatePresence>
        {phase === 'celebrating' && celebrationKind && (
          <ApprovalCelebration
            key="celebration"
            kind={celebrationKind}
            onDone={onSent}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
