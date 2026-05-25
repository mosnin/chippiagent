'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  CheckCircle2, XCircle, MessageSquare, Mail, StickyNote,
  Loader2, RefreshCw, Pencil, Copy, Check,
  AlertTriangle, Send, TriangleAlert, MessageCircle, Paperclip,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';
import { ApprovalCelebration, type ApprovalKind } from '@/components/chippi/approval-celebration';

interface DeliveryResult {
  sent: boolean;
  method: 'email' | 'sms' | 'note';
  error?: string;
}

interface DraftContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface AgentDraft {
  id: string;
  contactId: string | null;
  dealId: string | null;
  channel: 'sms' | 'email' | 'note';
  subject: string | null;
  content: string;
  reasoning: string | null;
  priority: number;
  confidence: number | null;
  status: 'pending' | 'approved' | 'dismissed' | 'sent';
  createdAt: string;
  expiresAt: string | null;
  Contact: DraftContact | null;
}

interface Props {
  slug: string;
}

const CHANNEL_META = {
  sms:   { label: 'SMS',   icon: MessageSquare, charLimit: 160 },
  email: { label: 'Email', icon: Mail,          charLimit: null },
  note:  { label: 'Note',  icon: StickyNote,    charLimit: null },
} as const;

// Phase D — autonomy default flip. When the agent is highly confident in a
// draft, default it to auto-send after a short countdown unless the realtor
// cancels. Gated by the env flag so we can land the code, dogfood internally,
// and flip on per-deploy without another release. 80% mirrors the existing
// confidence "green dot" threshold in the row meta line. 30s gives a realtor
// scanning their inbox time to react without making "auto" feel meaningless.
const AUTO_SEND_FLAG = process.env.NEXT_PUBLIC_AGENT_AUTO_SEND === 'true';
const AUTO_SEND_CONFIDENCE_THRESHOLD = 80;
const AUTO_SEND_DELAY_MS = 30_000;
const AUTO_SEND_TICK_MS = 250;

// ─── DraftRow ────────────────────────────────────────────────────────────────

function DraftRow({
  draft,
  slug,
  onAction,
  onCelebrationDone,
}: {
  draft: AgentDraft;
  slug: string;
  onAction: (id: string, status: 'approved' | 'dismissed', content?: string) => Promise<DeliveryResult | null>;
  /** Called once the row's celebration dwell has finished — parent removes the row then. */
  onCelebrationDone: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(draft.content);
  const [actioning, setActioning] = useState<'approved' | 'dismissed' | null>(null);
  const [copied, setCopied] = useState(false);
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [autoSendCancelled, setAutoSendCancelled] = useState(false);
  const [autoSendRemainingMs, setAutoSendRemainingMs] = useState<number | null>(null);
  /** When set, the row replaces its own content with the celebration line. */
  const [celebrationKind, setCelebrationKind] = useState<ApprovalKind | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const meta = CHANNEL_META[draft.channel];
  const Icon = meta.icon;
  // A draft carrying a property packet — recognised by the secure
  // /packet/<token> path the agent's send_property_packet tool produces.
  // Subtle pill in the meta row so the realtor knows what they're approving
  // before reading the body.
  const hasPacket = /\/packet\/[a-zA-Z0-9_-]+/i.test(draft.content);
  const isEdited = editedContent.trim() !== draft.content;
  const overLimit = meta.charLimit !== null && editedContent.length > meta.charLimit;
  const nearLimit = meta.charLimit !== null && editedContent.length > meta.charLimit * 0.85;
  const autoSendEligible =
    AUTO_SEND_FLAG &&
    !autoSendCancelled &&
    !editing &&
    actioning === null &&
    !overLimit &&
    draft.confidence !== null &&
    draft.confidence !== undefined &&
    draft.confidence >= AUTO_SEND_CONFIDENCE_THRESHOLD;

  function startEdit() {
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function cancelEdit() {
    setEditing(false);
    setEditedContent(draft.content);
  }

  async function handleApprove() {
    setActioning('approved');
    const result = await onAction(draft.id, 'approved', isEdited ? editedContent : undefined);
    if (result !== null && !result?.sent) {
      try { await navigator.clipboard.writeText(editedContent); } catch { /* ignore */ }
    }
    if (!mountedRef.current) return;
    // Sent successfully → celebrate in place. The parent left the row mounted
    // for us; once the celebration dwell ends we tell it to remove the row.
    // Failed delivery / not-configured paths fall through to the existing
    // banner so the realtor sees the actionable nudge instead of a win line.
    if (result?.sent) {
      const kind: ApprovalKind =
        draft.channel === 'note' ? 'note' : draft.channel === 'email' ? 'email' : 'sms';
      setCelebrationKind(kind);
    } else {
      setActioning(null);
    }
  }

  async function handleDismiss() {
    setActioning('dismissed');
    setDismissError(null);
    try {
      await onAction(draft.id, 'dismissed');
    } catch {
      if (mountedRef.current) {
        setActioning(null);
        setDismissError('Could not dismiss — please try again.');
      }
    }
  }

  async function copyContent() {
    await navigator.clipboard.writeText(editedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Phase D countdown — counts down once per row when eligible. Tick every
  // 250ms so the displayed seconds feel responsive without thrashing renders.
  // We start from the moment the row meets all conditions; if the realtor
  // edits or actions the row mid-flight, the effect re-evaluates and bails.
  useEffect(() => {
    if (!autoSendEligible) {
      setAutoSendRemainingMs(null);
      return;
    }
    const startedAt = Date.now();
    setAutoSendRemainingMs(AUTO_SEND_DELAY_MS);
    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const remaining = AUTO_SEND_DELAY_MS - elapsed;
      if (remaining <= 0) {
        clearInterval(interval);
        if (mountedRef.current) {
          setAutoSendRemainingMs(0);
          // Run after state flushes; handleApprove flips actioning, which
          // in turn makes autoSendEligible false on the next render so the
          // countdown effect winds down cleanly.
          handleApprove();
        }
      } else if (mountedRef.current) {
        setAutoSendRemainingMs(remaining);
      }
    }, AUTO_SEND_TICK_MS);
    return () => clearInterval(interval);
    // handleApprove is stable enough — it only reads refs/state, and a fresh
    // closure each tick would restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSendEligible]);

  // When the row is celebrating, the body collapses to one calm sentence —
  // contact name still anchors the moment so the realtor knows whose row
  // they just resolved as the others stagger up to fill the space.
  if (celebrationKind) {
    return (
      <article className="group/row py-5 first:pt-0 last:pb-0">
        <div className="flex items-baseline gap-2 text-sm">
          {draft.Contact && (
            <span className="font-medium text-muted-foreground truncate">
              {draft.Contact.name}
            </span>
          )}
          <ApprovalCelebration
            kind={celebrationKind}
            onDone={() => onCelebrationDone(draft.id)}
          />
        </div>
      </article>
    );
  }

  return (
    <article className="group/row py-5 first:pt-0 last:pb-0">
      {/* Meta line: contact · channel · confidence · time */}
      <div className="flex items-center gap-3 text-sm">
        {draft.Contact ? (
          <Link
            href={`/s/${slug}/contacts/${draft.Contact.id}`}
            className="font-medium text-foreground hover:underline underline-offset-2 truncate"
          >
            {draft.Contact.name}
          </Link>
        ) : (
          <span className="font-medium text-muted-foreground">Unknown contact</span>
        )}

        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Icon size={12} className="opacity-70" />
          {meta.label}
        </span>

        {hasPacket && (
          <span
            className="inline-flex items-center gap-1 text-[11px] text-orange-600 dark:text-orange-400"
            title="Packet attached"
          >
            <Paperclip size={11} className="opacity-80" />
            Packet
          </span>
        )}

        {draft.Contact?.phone && draft.channel === 'sms' && (
          <span className="hidden sm:inline text-xs text-muted-foreground tabular-nums truncate">
            {draft.Contact.phone}
          </span>
        )}
        {draft.Contact?.email && draft.channel === 'email' && (
          <span className="hidden sm:inline text-xs text-muted-foreground truncate">
            {draft.Contact.email}
          </span>
        )}

        <span className="ml-auto flex items-center gap-2 flex-shrink-0">
          {draft.confidence !== null && draft.confidence !== undefined && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[11px]',
                draft.confidence >= 80
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : draft.confidence >= 50
                    ? 'text-muted-foreground'
                    : 'text-amber-600 dark:text-amber-400',
              )}
              title={`${draft.confidence}% confidence`}
            >
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  draft.confidence >= 80
                    ? 'bg-emerald-500'
                    : draft.confidence >= 50
                      ? 'bg-muted-foreground/50'
                      : 'bg-amber-500',
                )}
              />
              {draft.confidence}%
            </span>
          )}
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {timeAgo(draft.createdAt)}
          </span>
        </span>
      </div>

      {/* Subject (email only) */}
      {draft.subject && (
        <p className="mt-2 text-sm font-medium text-foreground">{draft.subject}</p>
      )}

      {/* Body */}
      {editing ? (
        <div className="mt-2 space-y-1.5">
          <textarea
            ref={textareaRef}
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            rows={Math.max(3, Math.ceil(editedContent.length / 60))}
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span
            className={cn(
              'text-[11px] tabular-nums',
              overLimit ? 'text-destructive font-medium' : nearLimit ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
            )}
          >
            {editedContent.length}{meta.charLimit ? ` / ${meta.charLimit}` : ''} chars
            {overLimit && ' — too long for SMS'}
          </span>
        </div>
      ) : (
        <div className="group/content relative mt-2">
          <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap pr-14">
            {editedContent}
            {isEdited && (
              <span className="ml-1.5 text-[11px] text-muted-foreground italic">(edited)</span>
            )}
          </p>
          <div className="absolute top-0 right-0 flex items-center gap-1 opacity-0 group-hover/content:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              onClick={copyContent}
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              title="Copy"
              aria-label="Copy message"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
            </button>
            <button
              onClick={startEdit}
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              title="Edit"
              aria-label="Edit message"
            >
              <Pencil size={11} />
            </button>
          </div>
        </div>
      )}

      {!editing && meta.charLimit && editedContent.length > meta.charLimit && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertTriangle size={11} />
          Exceeds {meta.charLimit}-character SMS limit
        </p>
      )}

      {/* Reasoning — quieter than before, no left border bar */}
      {draft.reasoning && !editing && (
        <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground italic">
          {draft.reasoning}
        </p>
      )}

      {/* Phase D — auto-send countdown. Visible only when the env flag is on
          and the draft cleared the confidence bar. Cancel returns the row to
          the standard approve/dismiss workflow without firing anything. */}
      {autoSendRemainingMs !== null && autoSendRemainingMs > 0 && (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-emerald-700 dark:text-emerald-400">
          <span className="relative inline-flex items-center justify-center w-4 h-4 flex-shrink-0">
            <span
              aria-hidden
              className="absolute inset-0 rounded-full border border-emerald-500/30"
            />
            <span
              aria-hidden
              className="absolute inset-0 rounded-full border-2 border-emerald-500 border-r-transparent border-b-transparent animate-spin"
              style={{ animationDuration: '1.2s' }}
            />
            <MessageCircle size={9} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.25} />
          </span>
          <span className="font-medium">
            Auto-sending in {Math.ceil(autoSendRemainingMs / 1000)}s
          </span>
          <button
            type="button"
            onClick={() => setAutoSendCancelled(true)}
            className="ml-1 text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="mt-3.5 flex items-center gap-1.5">
        {draft.channel === 'sms' || draft.channel === 'email' ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={actioning !== null || (overLimit && draft.channel === 'sms')}
              >
                {actioning === 'approved' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Send size={12} />
                )}
                {editing ? 'Save & send' : 'Approve & send'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Send this {draft.channel}?</AlertDialogTitle>
                <AlertDialogDescription>
                  I'll send this to {draft.Contact?.name ?? 'this contact'}. Once it's gone, it's gone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={handleApprove}
                >
                  Yes, send it
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={handleApprove}
            disabled={actioning !== null}
          >
            {actioning === 'approved' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <CheckCircle2 size={12} />
            )}
            {editing ? 'Save & approve' : 'Approve'}
          </Button>
        )}

        {!editing && (
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={startEdit}>
            <Pencil size={11} />
            Edit
          </Button>
        )}

        {editing ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-muted-foreground hover:text-foreground ml-auto"
            onClick={cancelEdit}
          >
            Cancel
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive ml-auto"
            onClick={handleDismiss}
            disabled={actioning !== null}
          >
            {actioning === 'dismissed' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <XCircle size={12} />
            )}
            Dismiss
          </Button>
        )}
      </div>

      {dismissError && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle size={11} />
          {dismissError}
        </p>
      )}
    </article>
  );
}

// ─── DeliveryBanner ──────────────────────────────────────────────────────────

const DELIVERY_LABELS: Record<'email' | 'sms' | 'note', string> = {
  email: 'email',
  sms: 'SMS',
  note: 'note',
};

interface DeliveryFeedback {
  contactName: string | null;
  result: DeliveryResult;
}

function DeliveryBanner({ feedback, onClose }: { feedback: DeliveryFeedback; onClose: () => void }) {
  const { result, contactName } = feedback;
  const isNotConfigured = result.error === 'not_configured';
  const methodLabel = DELIVERY_LABELS[result.method];

  if (result.sent) {
    const msg = result.method === 'note'
      ? contactName ? `Note logged for ${contactName}` : 'Note logged'
      : contactName ? `Sent to ${contactName} via ${methodLabel}` : `Sent via ${methodLabel}`;
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 py-2">
        <Send size={12} className="flex-shrink-0" />
        <span>{msg}</span>
        <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Dismiss">
          <XCircle size={12} />
        </button>
      </div>
    );
  }

  if (isNotConfigured) {
    return (
      <div className="flex items-start gap-2 text-xs text-muted-foreground py-2">
        <Copy size={12} className="flex-shrink-0 mt-0.5" />
        <span>
          Copied to clipboard. Add{' '}
          <code className="text-[11px] bg-muted px-1 rounded">
            {methodLabel === 'email' ? 'RESEND_API_KEY' : 'TELNYX_API_KEY'}
          </code>
          {' '}to enable auto-send.
        </span>
        <button onClick={onClose} className="ml-auto flex-shrink-0" aria-label="Dismiss"><XCircle size={12} /></button>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 py-2">
      <TriangleAlert size={12} className="flex-shrink-0 mt-0.5" />
      <span>
        <span className="font-medium">Delivery failed</span> — draft approved but {methodLabel} not sent.
        {result.error && <span className="opacity-75"> {result.error}</span>}
      </span>
      <button onClick={onClose} className="ml-auto flex-shrink-0" aria-label="Dismiss"><XCircle size={12} /></button>
    </div>
  );
}

// ─── AgentDraftInbox ─────────────────────────────────────────────────────────

export function AgentDraftInbox({ slug }: Props) {
  const [drafts, setDrafts] = useState<AgentDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingAll, setApprovingAll] = useState(false);
  const [deliveryFeedback, setDeliveryFeedback] = useState<DeliveryFeedback | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agent/drafts?status=pending&limit=50');
      if (res.ok) setDrafts(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  function showFeedback(contactName: string | null, result: DeliveryResult) {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setDeliveryFeedback({ contactName, result });
    feedbackTimer.current = setTimeout(() => setDeliveryFeedback(null), 5_000);
  }

  async function handleAction(
    draftId: string,
    status: 'approved' | 'dismissed',
    content?: string,
  ): Promise<DeliveryResult | null> {
    const restored = drafts.find((d) => d.id === draftId) ?? null;
    const contactName = restored?.Contact?.name ?? null;

    // Dismiss path: collapse the row immediately. There's no win to celebrate.
    // Approve path: the row stays mounted so it can transform into the
    // celebration sentence in place; removal is driven by handleCelebrationDone
    // once the dwell ends.
    if (status === 'dismissed') {
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    }

    const body: Record<string, unknown> = { status };
    if (content !== undefined) body.content = content;

    try {
      const res = await fetch(`/api/agent/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        if (status === 'dismissed' && restored) {
          setDrafts((prev) => [restored, ...prev]);
        }
        toast.error("That didn't go through. Try again.");
        return null;
      }

      const data = await res.json();
      if (status === 'approved' && data.deliveryResult) {
        const result = data.deliveryResult as DeliveryResult;
        // Only fall back to the legacy delivery banner when delivery DIDN'T
        // succeed — a successful send is celebrated inline by the row itself.
        if (!result.sent) {
          showFeedback(contactName, result);
        }
        return result;
      }
      return null;
    } catch {
      if (status === 'dismissed' && restored) {
        setDrafts((prev) => [restored, ...prev]);
      }
      toast.error("I lost the connection. Try again.");
      return null;
    }
  }

  function handleCelebrationDone(draftId: string) {
    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
  }

  async function approveAll() {
    if (!drafts.length) return;
    setApprovingAll(true);
    try {
      const results = await Promise.allSettled(
        drafts.map((d) => fetch(`/api/agent/drafts/${d.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approved', content: d.content }),
        }).then((r) => { if (!r.ok) throw new Error(r.status.toString()); }))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      const succeeded = results.length - failed;
      if (failed > 0) {
        toast.error(`${succeeded} approved, ${failed} got stuck. Try those again.`);
      } else {
        toast.success(`All ${succeeded} drafts approved.`);
      }
      void load();
    } finally {
      setApprovingAll(false);
    }
  }

  return (
    <section>
      {/* Section header — typography driven, no card chrome */}
      <div className="flex items-center gap-3 pb-3 border-b border-border/60">
        <h2 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-muted-foreground">
          Drafts I made
        </h2>
        {!loading && drafts.length > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {drafts.length}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!loading && drafts.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5"
              onClick={approveAll}
              disabled={approvingAll}
            >
              {approvingAll ? <Loader2 size={11} className="animate-spin" /> : null}
              Approve all
            </Button>
          )}
          <button
            onClick={load}
            className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            title="Refresh"
            aria-label="Refresh drafts"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Delivery banner */}
      {deliveryFeedback && (
        <div className="border-b border-border/60">
          <DeliveryBanner feedback={deliveryFeedback} onClose={() => setDeliveryFeedback(null)} />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4 pt-5">
          {[1, 2].map((n) => (
            <div key={n} className="space-y-2">
              <div className="h-4 w-48 rounded bg-muted/50 animate-pulse" />
              <div className="h-12 w-full rounded bg-muted/30 animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && drafts.length === 0 && (
        <div className="py-8 text-sm text-muted-foreground">
          Inbox is clear. Chippi will leave new outreach here whenever there&apos;s someone worth following up with.
        </div>
      )}

      {/* Draft rows */}
      {!loading && drafts.length > 0 && (
        <StaggerList className="divide-y divide-border/60">
          {drafts.map((draft) => (
            <StaggerItem key={draft.id}>
              <DraftRow
                draft={draft}
                slug={slug}
                onAction={handleAction}
                onCelebrationDone={handleCelebrationDone}
              />
            </StaggerItem>
          ))}
        </StaggerList>
      )}
    </section>
  );
}
