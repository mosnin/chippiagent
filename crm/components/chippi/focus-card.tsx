'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Send, Pencil, Clock, Loader2, MessageSquare, Mail, StickyNote, AlertTriangle,
  CheckCircle2, ArrowRight, HelpCircle, MessageCircle,
} from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { toast } from 'sonner';
import { BODY_MUTED, QUIET_LINK, TITLE_FONT, PRIMARY_PILL } from '@/lib/typography';
import { buildIntakeUrl } from '@/lib/intake';
import { levenshtein } from '@/lib/draft-feedback';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DraftContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface AgentDraft {
  id: string;
  channel: 'sms' | 'email' | 'note';
  subject: string | null;
  content: string;
  reasoning: string | null;
  confidence: number | null;
  createdAt: string;
  Contact: DraftContact | null;
}

interface AgentQuestion {
  id: string;
  question: string;
  context: string | null;
  contactId: string | null;
  Contact: { id: string; name: string } | null;
  createdAt: string;
  status: 'pending' | 'answered' | 'expired';
}

type FocusItem =
  | { kind: 'draft'; id: string; data: AgentDraft }
  | { kind: 'question'; id: string; data: AgentQuestion };

const CHANNEL_META = {
  sms:   { label: 'SMS',   icon: MessageSquare, charLimit: 160 },
  email: { label: 'Email', icon: Mail,          charLimit: null },
  note:  { label: 'Note',  icon: StickyNote,    charLimit: null },
} as const;

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  slug: string;
  onShowFullDay: () => void;
  /**
   * True only when the realtor has done absolutely nothing yet — no contacts,
   * no deals, no conversations, no drafts, no questions. Day-one state. The
   * agent should speak first instead of sitting silent.
   */
  isFresh?: boolean;
  /** First name for the day-one welcome greeting. */
  firstName?: string;
  /**
   * Day-one CTA — the parent prefills the composer with this text and
   * focuses it. Wired through chippi-workspace.
   */
  onTellMeAboutLead?: (prefill: string) => void;
}

/**
 * Focus mode — one focal item at a time.
 *
 * Cascade: drafts (most urgent) → questions (next-most). Realtor sees ONE
 * card with one decision: Send / Edit / Hold for later. Action lands, the
 * next card slides in. Empty queue: calm acknowledgement.
 *
 * Hold is local-only — the item stays in the queue for next time, but
 * rotates out of view now. Realtors should never feel forced to act on
 * something they're not ready for; the "show full day" link is one tap
 * away when they want the dashboard.
 */
export function FocusCard({
  slug,
  onShowFullDay,
  isFresh = false,
  firstName,
  onTellMeAboutLead,
}: Props) {
  const [items, setItems] = useState<FocusItem[]>([]);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [answer, setAnswer] = useState('');
  const [acting, setActing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // First-view timestamp for the currently focused item. Reset whenever the
  // realtor rotates to a new card. Used to compute time-to-decision (an
  // important feedback signal — fast send = trust the model, slow send = the
  // model is making the realtor think too hard). Per-card so a held card
  // resuming later doesn't get credited a 4-hour decisionMs.
  const viewedAtRef = useRef<number>(Date.now());

  const refresh = useCallback(async () => {
    setLoading(true);
    setEditing(false);
    setAnswer('');
    try {
      const [draftsRes, questionsRes] = await Promise.all([
        fetch('/api/agent/drafts?status=pending&limit=10'),
        fetch('/api/agent/questions?status=pending&limit=10'),
      ]);
      const drafts: AgentDraft[] = draftsRes.ok ? await draftsRes.json() : [];
      const questions: AgentQuestion[] = questionsRes.ok ? await questionsRes.json() : [];

      const next: FocusItem[] = [
        ...drafts.map((d) => ({ kind: 'draft' as const, id: d.id, data: d })),
        ...questions.map((q) => ({ kind: 'question' as const, id: q.id, data: q })),
      ];
      setItems(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Find the next item that hasn't been held in this session
  const current = items.find((i) => !skipped.has(`${i.kind}:${i.id}`)) ?? null;

  // Reset edit state when current item changes (rotated to next).
  // Also reset the view timestamp — the realtor is "first seeing" this item
  // now, even if it was queued an hour ago server-side. Decision latency is
  // the time the *realtor* spent looking at the card, not the time the draft
  // sat in the queue.
  useEffect(() => {
    if (current?.kind === 'draft') setEditContent(current.data.content);
    setEditing(false);
    setAnswer('');
    viewedAtRef.current = Date.now();
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Actions ─────────────────────────────────────────────────────────────

  function hold() {
    if (!current) return;
    // Fire-and-forget feedback ping for drafts. Holding is signal too: "you
    // showed me this and I wasn't ready to act on it yet." We don't await —
    // hold has to feel instant, and a failed feedback write must not block
    // the realtor from rotating. Questions don't get this ping (different
    // table, different table column).
    if (current.kind === 'draft') {
      const decisionMs = Math.max(0, Date.now() - viewedAtRef.current);
      const editDistance = levenshtein(current.data.content, editContent.trim());
      void fetch('/api/agent/drafts/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: current.id,
          action: 'held',
          decisionMs,
          editDistance,
        }),
        keepalive: true,
      }).catch(() => {/* swallow — signal is best-effort */});
    }
    setSkipped((prev) => new Set([...prev, `${current.kind}:${current.id}`]));
  }

  async function approveDraft() {
    if (!current || current.kind !== 'draft') return;
    setActing(true);
    try {
      const original = current.data.content;
      const finalText = editContent.trim();
      const isEdited = finalText !== original;
      // Distance is computed against the original content (not the trimmed
      // edit buffer's prior state) — what we want is "how far from what the
      // model gave us". Cheap on the client; the server clamps and validates.
      const editDistance = isEdited ? levenshtein(original, finalText) : 0;
      const decisionMs = Math.max(0, Date.now() - viewedAtRef.current);
      const body: Record<string, unknown> = {
        status: 'approved',
        editDistance,
        decisionMs,
      };
      if (isEdited) body.content = editContent;
      const res = await fetch(`/api/agent/drafts/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast.error("Couldn't send that. Try again.");
        return;
      }
      // Remove from local items so the next one rotates in
      setItems((prev) => prev.filter((i) => !(i.kind === 'draft' && i.id === current.id)));
      const data = await res.json().catch(() => null);
      if (data?.deliveryResult?.sent) {
        toast.success(
          current.data.Contact
            ? `Sent to ${current.data.Contact.name}`
            : 'Sent',
        );
      } else if (data?.deliveryResult?.error === 'not_configured') {
        toast.success('Copied. Add an integration and I can auto-send next time.');
      } else {
        toast.success('Approved.');
      }
    } catch {
      toast.error("I lost the connection. Try again.");
    } finally {
      setActing(false);
    }
  }

  async function answerQuestion() {
    if (!current || current.kind !== 'question') return;
    const trimmed = answer.trim();
    if (!trimmed) return;
    setActing(true);
    try {
      const res = await fetch(`/api/agent/questions/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: trimmed }),
      });
      if (!res.ok) {
        toast.error("Couldn't send that. Try again.");
        return;
      }
      setItems((prev) => prev.filter((i) => !(i.kind === 'question' && i.id === current.id)));
      toast.success('Answered.');
    } catch {
      toast.error("I lost the connection. Try again.");
    } finally {
      setActing(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto rounded-lg border border-border/70 bg-card p-6 animate-pulse">
        <div className="h-4 w-32 rounded bg-muted/50 mb-4" />
        <div className="h-3 w-full rounded bg-muted/40 mb-2" />
        <div className="h-3 w-5/6 rounded bg-muted/40 mb-6" />
        <div className="flex gap-2">
          <div className="h-9 w-24 rounded bg-muted/50" />
          <div className="h-9 w-16 rounded bg-muted/40" />
        </div>
      </div>
    );
  }

  // No items at all (server-side empty)
  if (items.length === 0) {
    if (isFresh) {
      return (
        <FocusWelcome
          slug={slug}
          firstName={firstName}
          onTellMeAboutLead={onTellMeAboutLead}
        />
      );
    }
    return (
      <FocusEmpty onShowFullDay={onShowFullDay} variant="all-clear" />
    );
  }

  // Items exist but realtor has held them all in this session
  if (!current) {
    return (
      <FocusEmpty
        onShowFullDay={onShowFullDay}
        variant="held"
        onUnhold={() => setSkipped(new Set())}
      />
    );
  }

  // ─── Draft card ──────────────────────────────────────────────────────────
  if (current.kind === 'draft') {
    const draft = current.data;
    const meta = CHANNEL_META[draft.channel];
    const Icon = meta.icon;
    const isEdited = editContent.trim() !== draft.content;
    const overLimit = meta.charLimit !== null && editContent.length > meta.charLimit;

    return (
      <article
        key={current.id}
        className="max-w-2xl mx-auto rounded-lg border border-border/70 bg-card p-6 transition-opacity duration-150"
      >
        {/* Meta line */}
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
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            {timeAgo(draft.createdAt)}
          </span>
        </div>

        {draft.subject && (
          <p className="mt-3 text-sm font-medium text-foreground">{draft.subject}</p>
        )}

        {/* Body */}
        {editing ? (
          <div className="mt-3 space-y-1.5">
            <Textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={Math.max(3, Math.ceil(editContent.length / 60))}
              autoFocus
            />
            {meta.charLimit !== null && (
              <span
                className={cn(
                  'text-[11px] tabular-nums',
                  overLimit ? 'text-destructive font-medium' : 'text-muted-foreground',
                )}
              >
                {editContent.length} / {meta.charLimit} chars
                {overLimit && ' — too long for SMS'}
              </span>
            )}
          </div>
        ) : (
          <p className="mt-3 text-[15px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
            {editContent}
            {isEdited && (
              <span className="ml-1.5 text-[11px] text-muted-foreground italic">(edited)</span>
            )}
          </p>
        )}

        {!editing && draft.reasoning && (
          <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground italic">
            {draft.reasoning}
          </p>
        )}

        {!editing && overLimit && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-destructive">
            <AlertTriangle size={11} />
            Exceeds {meta.charLimit}-character SMS limit
          </p>
        )}

        {/* Actions */}
        <div className="mt-5 flex items-center gap-2">
          {draft.channel === 'sms' || draft.channel === 'email' ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={acting || (overLimit && draft.channel === 'sms')}
                >
                  {acting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  {editing ? 'Save & send' : 'Send'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Send this {draft.channel}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {draft.Contact
                      ? `I'll send this to ${draft.Contact.name}. Once it's gone, it's gone.`
                      : "Once it's gone, it's gone."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={approveDraft}>Yes, send it</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button size="sm" className="gap-1.5" onClick={approveDraft} disabled={acting}>
              {acting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              {editing ? 'Save & approve' : 'Approve'}
            </Button>
          )}

          {!editing ? (
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setEditing(true)}>
              <Pencil size={11} />
              Edit
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setEditContent(draft.content);
              }}
            >
              Cancel edit
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 ml-auto text-muted-foreground"
            onClick={hold}
            disabled={acting}
          >
            <Clock size={11} />
            Hold for later
          </Button>
        </div>
      </article>
    );
  }

  // ─── Question card ───────────────────────────────────────────────────────
  const question = current.data;
  return (
    <article
      key={current.id}
      className="max-w-2xl mx-auto rounded-lg border border-border/70 bg-card p-6 transition-opacity duration-150"
    >
      <div className="flex items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
          <HelpCircle size={13} />
          Chippi has a question
        </span>
        {question.Contact && (
          <span className="text-xs text-muted-foreground truncate">
            about {question.Contact.name}
          </span>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {timeAgo(question.createdAt)}
        </span>
      </div>

      <p className="mt-3 text-[15px] leading-relaxed text-foreground">
        {question.question}
      </p>

      {question.context && (
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground italic">
          {question.context}
        </p>
      )}

      <Textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Your answer…"
        rows={3}
        className="mt-4"
        disabled={acting}
      />

      <div className="mt-4 flex items-center gap-2">
        <Button
          size="sm"
          className="gap-1.5"
          onClick={answerQuestion}
          disabled={acting || !answer.trim()}
        >
          {acting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          Send answer
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 ml-auto text-muted-foreground"
          onClick={hold}
          disabled={acting}
        >
          <Clock size={11} />
          Hold for later
        </Button>
      </div>
    </article>
  );
}

// ─── Day-one welcome ────────────────────────────────────────────────────────

/**
 * Day one. Zero contacts, zero deals, zero conversations. The agent speaks
 * first instead of waiting to be asked. One idea: tell me about a lead and
 * I'll start your pipeline. Single primary action, single quiet escape hatch.
 */
function FocusWelcome({
  slug,
  firstName,
  onTellMeAboutLead,
}: {
  slug: string;
  firstName?: string;
  onTellMeAboutLead?: (prefill: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyIntakeLink() {
    const url = buildIntakeUrl(slug);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Intake link copied.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy that. Try again.");
    }
  }

  function handleTellMe() {
    onTellMeAboutLead?.('Hi Chippi, my most recent lead is ');
  }

  return (
    <div className="max-w-2xl mx-auto text-center py-10">
      {/* Amber circle with a slow breathing pulse — signals life, not decoration. */}
      <motion.div
        aria-hidden
        className="mx-auto mb-6 w-16 h-16 rounded-full bg-amber-100/70 dark:bg-amber-500/10 flex items-center justify-center"
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
      >
        <MessageCircle size={20} className="text-amber-500 dark:text-amber-400" aria-hidden />
      </motion.div>
      <h2
        className="text-3xl tracking-tight text-foreground"
        style={TITLE_FONT}
      >
        Welcome{firstName ? `, ${firstName}` : ''}.
      </h2>
      <p className={cn(BODY_MUTED, 'mt-2 max-w-md mx-auto leading-relaxed')}>
        I track your deals, draft your follow-ups, and flag what&apos;s stuck &mdash; automatically. Start with a lead and I&apos;ll show you.
      </p>
      <div className="mt-6 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={handleTellMe}
          className={PRIMARY_PILL}
          disabled={!onTellMeAboutLead}
        >
          Tell me about a lead →
        </button>
        <button
          type="button"
          onClick={copyIntakeLink}
          className={QUIET_LINK}
        >
          {copied ? 'Link copied' : 'Or share your intake link'}
        </button>
      </div>
    </div>
  );
}

// ─── Empty states ───────────────────────────────────────────────────────────

function FocusEmpty({
  onShowFullDay,
  variant,
  onUnhold,
}: {
  onShowFullDay: () => void;
  variant: 'all-clear' | 'held';
  onUnhold?: () => void;
}) {
  if (variant === 'held') {
    return (
      <div className="max-w-2xl mx-auto text-center py-10">
        <p className="text-base text-foreground">Nothing else right now.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          You held everything for later. They&apos;re waiting in the full day view.
        </p>
        <div className="mt-4 flex items-center gap-3 justify-center">
          {onUnhold && (
            <button
              type="button"
              onClick={onUnhold}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Bring them back
            </button>
          )}
          <button
            type="button"
            onClick={onShowFullDay}
            className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline"
          >
            Show full day
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-2xl mx-auto text-center py-10">
      <p className="text-base text-foreground">You&apos;re clear.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Nothing waiting on you. I&apos;ll let you know when something needs you.
      </p>
      <p className="text-xs text-muted-foreground/70 mt-3 text-center">
        Try asking: &ldquo;Who should I call today?&rdquo; or &ldquo;Draft a check-in for my hottest lead.&rdquo;
      </p>
      <button
        type="button"
        onClick={onShowFullDay}
        className="mt-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        Show full day
        <ArrowRight size={12} />
      </button>
    </div>
  );
}
